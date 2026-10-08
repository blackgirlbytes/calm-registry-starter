"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { api, authEnabled, getBrowserSupabase, REGISTRIES_CHANGED } from "@/lib/client";
import type { IntakeDraft } from "@/lib/types";

type Summary = { id: string; slug: string; title: string };

const COLLAPSED_KEY = "calm-registry:sidebar-collapsed";

/** Pages family and friends open from a share link: no account, so no app navigation. */
function isPublic(pathname: string) {
  return pathname.startsWith("/r/");
}

/**
 * The app frame: a collapsible sidebar listing your registries on laptops, and a top bar with a
 * menu drawer on phones. Signed-out visitors get just the name at the top; the family share page gets the page alone.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const signedIn = useSignedIn();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // Starts open.
    }
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      // Not remembered on this device.
    }
  }

  const page = <div className="mx-auto min-h-dvh max-w-7xl px-4 pb-16 sm:px-6 lg:px-10 2xl:max-w-[1440px]">{children}</div>;
  if (isPublic(pathname)) return page;
  if (!signedIn) {
    return (
      <div className="mx-auto min-h-dvh max-w-7xl px-4 pb-16 sm:px-6 lg:px-10 2xl:max-w-[1440px]">
        <header className="pt-5 lg:pt-8">
          <Link href="/" className="font-serif text-[17px] font-semibold">
            Calm Registry
          </Link>
        </header>
        {children}
      </div>
    );
  }

  return (
    <div className="lg:flex">
      <aside
        aria-label="My registries"
        className={`sticky top-0 hidden h-dvh shrink-0 border-r border-line bg-surface transition-[width] duration-200 lg:block ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <Suspense>
          <Nav collapsed={collapsed} onToggle={toggle} />
        </Suspense>
      </aside>

      <header className="flex items-center justify-between px-4 pt-4 sm:px-6 lg:hidden">
        <Link href="/" className="font-serif text-[17px] font-semibold">
          Calm Registry
        </Link>
        <button className="btn-quiet gap-2 px-3 py-2 text-[14px]" onClick={() => setDrawer(true)} aria-expanded={drawer}>
          <MenuIcon />
          My registries
        </button>
      </header>

      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="My registries">
          <button aria-label="Close menu" className="absolute inset-0 bg-text/25" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] animate-[drawer-in_.2s_ease-out] bg-surface shadow-[0_0_40px_rgb(58_49_80/0.18)]">
            <Suspense>
              <Nav onClose={() => setDrawer(false)} />
            </Suspense>
          </div>
        </div>
      )}

      <div className="min-w-0 flex-1">{page}</div>
    </div>
  );
}

function useSignedIn() {
  const [signedIn, setSignedIn] = useState(!authEnabled);
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn;
}

function useMyRegistries() {
  const pathname = usePathname();
  const [registries, setRegistries] = useState<Summary[] | null>(null);
  const [drafts, setDrafts] = useState<IntakeDraft[]>([]);

  const load = useCallback(async () => {
    const [r, d] = await Promise.all([
      api<{ registries: Summary[] }>("/api/registries").catch(() => null),
      api<{ drafts: IntakeDraft[] }>("/api/drafts").catch(() => null),
    ]);
    if (r) setRegistries(r.registries);
    if (d) setDrafts(d.drafts);
  }, []);

  // Pages change registries (building, renaming, deleting), so the list refreshes on navigation and on those changes.
  useEffect(() => {
    void load();
  }, [load, pathname]);
  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(REGISTRIES_CHANGED, onChange);
    return () => window.removeEventListener(REGISTRIES_CHANGED, onChange);
  }, [load]);

  return { registries, drafts, reload: load };
}

function answered(draft: IntakeDraft) {
  return draft.messages.filter((m) => m.role === "user").length;
}

function Nav({ collapsed = false, onToggle, onClose }: { collapsed?: boolean; onToggle?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const { registries, drafts, reload } = useMyRegistries();
  const [confirming, setConfirming] = useState<string | null>(null);

  const unfinished = drafts.filter((d) => !d.registryId && (answered(d) > 0 || d.profile));
  const currentDraft = pathname === "/start" ? search.get("draft") : null;

  async function discard(id: string) {
    await api(`/api/drafts/${id}`, { method: "DELETE" }).catch(() => undefined);
    setConfirming(null);
    await reload();
  }

  if (collapsed) {
    return (
      <nav className="flex h-full flex-col items-center gap-3 py-5">
        <button className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-raise hover:text-text" onClick={onToggle} aria-label="Show my registries">
          <PanelIcon />
        </button>
        <Link href="/start?new" className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-on-primary hover:brightness-[.97]" aria-label="New registry" title="New registry">
          <PlusIcon />
        </Link>
        <ul className="mt-2 flex flex-col items-center gap-2">
          {registries?.map((r) => {
            const active = pathname.startsWith(`/registry/${r.id}`);
            return (
              <li key={r.id}>
                <Link
                  href={`/registry/${r.id}`}
                  title={r.title}
                  aria-label={r.title}
                  aria-current={active ? "page" : undefined}
                  className={`grid h-10 w-10 place-items-center rounded-full font-serif text-[15px] font-semibold ${
                    active ? "bg-primary text-on-primary" : "bg-raise text-text hover:bg-stage-blush"
                  }`}
                >
                  {r.title.trim().charAt(0).toUpperCase()}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav className="flex h-full flex-col overflow-y-auto px-4 py-5">
      <div className="flex items-center justify-between gap-2 pl-2">
        <Link href="/" className="font-serif text-[17px] font-semibold">
          Calm Registry
        </Link>
        {onToggle && (
          <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raise hover:text-text" onClick={onToggle} aria-label="Collapse sidebar">
            <PanelIcon />
          </button>
        )}
        {onClose && (
          <button className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-raise hover:text-text" onClick={onClose} aria-label="Close menu">
            <CloseIcon />
          </button>
        )}
      </div>

      <Link href="/start?new" className="btn-primary mt-6 justify-start gap-2.5 px-4 py-2.5">
        <PlusIcon />
        New registry
      </Link>

      <h2 className="mt-8 px-2 text-[13px] font-semibold text-muted">My registries</h2>
      {registries === null ? (
        <p className="mt-2 px-2 text-[14px] text-muted">Loading…</p>
      ) : registries.length === 0 && unfinished.length === 0 ? (
        <p className="mt-2 px-2 text-[14px] text-muted">Your registries show up here once you build one.</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {unfinished.map((d) => (
            <li key={d.id}>
              {confirming === d.id ? (
                <div className="space-y-2 rounded-xl bg-raise px-3 py-2.5 text-[14px]" role="alertdialog" aria-label="Discard these answers?">
                  <p>Discard these answers?</p>
                  <div className="flex gap-2">
                    <button className="btn-quiet flex-1 bg-bg px-2 py-1.5 text-[13px]" onClick={() => setConfirming(null)}>
                      Keep them
                    </button>
                    <button className="btn-primary flex-1 px-2 py-1.5 text-[13px]" onClick={() => void discard(d.id)}>
                      Discard
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`group flex items-center rounded-xl ${currentDraft === d.id ? "bg-raise" : "hover:bg-raise"}`}>
                  <Link href={`/start?draft=${d.id}`} className="min-w-0 flex-1 px-3 py-2.5" aria-current={currentDraft === d.id ? "page" : undefined}>
                    <span className="block truncate font-medium">A new registry</span>
                    <span className="block text-[13px] text-muted">
                      {d.profile ? "Answers ready to check" : `${answered(d)} ${answered(d) === 1 ? "answer" : "answers"} so far`}
                    </span>
                  </Link>
                  <button
                    className="mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-bg hover:text-text"
                    onClick={() => setConfirming(d.id)}
                    aria-label="Discard these answers"
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
            </li>
          ))}
          {registries.map((r) => {
            const active = pathname.startsWith(`/registry/${r.id}`);
            return (
              <li key={r.id}>
                <Link
                  href={`/registry/${r.id}`}
                  title={r.title}
                  aria-current={active ? "page" : undefined}
                  className={`block truncate rounded-xl px-3 py-2.5 ${active ? "bg-raise font-semibold" : "hover:bg-raise"}`}
                >
                  {r.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

const icon = { viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function MenuIcon() {
  return (
    <svg {...icon} className="h-4 w-4">
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg {...icon} className="h-5 w-5">
      <rect x="3" y="3.5" width="14" height="13" rx="2.5" />
      <path d="M8 3.5v13" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg {...icon} className="h-4 w-4">
      <path d="M10 4.5v11M4.5 10h11" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...icon} className="h-4 w-4">
      <path d="M5.5 5.5l9 9M14.5 5.5l-9 9" />
    </svg>
  );
}
