"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { ProductPhoto } from "@/components/ProductPhoto";
import { ProductRating } from "@/components/ProductRating";
import { DeleteRegistry, StartOverLink, YourAnswers } from "@/components/RegistryActions";
import { RegistryDetails } from "@/components/RegistryDetails";
import { Status } from "@/components/Status";
import { useRegistry } from "@/components/useRegistry";
import { api, formatPrice, totalPrice } from "@/lib/client";
import { CATEGORIES, RETAILER_LABELS, type Category, type EditDiff, type ItemStatus, type Registry, type RegistryItem } from "@/lib/types";

export default function RegistryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGate>
      <Overview id={id} />
    </AuthGate>
  );
}

function money(amount: number) {
  return `$${Math.round(amount).toLocaleString()}`;
}

function Overview({ id }: { id: string }) {
  const { registry, error, reload, setStatus, setQty } = useRegistry(id);

  if (error && !registry) return <Status tone="error">{error}</Status>;
  if (!registry) return <Status>Opening your registry…</Status>;

  const kept = registry.items.filter((i) => i.status !== "skip");
  const pending = registry.items.filter((i) => i.status === "pending").length;
  const purchased = kept.filter((i) => i.purchased).length;
  const total = kept.reduce((sum, i) => sum + totalPrice(i.offers, i.qty), 0);

  return (
    <main className="pt-6 pb-36 lg:grid lg:grid-cols-[340px_minmax(0,1fr)] lg:gap-16 lg:pt-10 lg:pb-16">
      <aside className="space-y-8 lg:sticky lg:top-10 lg:max-h-[calc(100dvh-2.5rem)] lg:self-start lg:overflow-y-auto lg:pb-10">
        <header className="space-y-3">
          <h1 className="font-serif text-[33px] leading-tight font-semibold">{registry.title}</h1>
          <p className="text-muted">
            {kept.length} items, about {money(total)} in all.{" "}
            {pending > 0 ? null : purchased > 0 ? `${purchased} gifted so far.` : "Nothing gifted yet."}
          </p>
        </header>

        {/* One next step: finish reviewing, then share. */}
        {pending > 0 ? (
          <div className="space-y-4 rounded-2xl bg-surface p-5">
            <div className="space-y-1">
              <p className="font-serif text-[19px] font-semibold">
                {pending} {pending === 1 ? "item" : "items"} still to review
              </p>
              <p className="text-[14px] text-muted">Keep or skip each one before you share the list with family.</p>
            </div>
            <Link href={`/registry/${id}/review`} className="btn-primary w-full">
              Continue review
            </Link>
          </div>
        ) : (
          <ShareCard slug={registry.slug} />
        )}

        <RegistrySettings registry={registry} onSaved={reload} />
        <EditBar registry={registry} onApplied={reload} />
      </aside>

      <ItemList registryId={id} items={kept} setStatus={setStatus} setQty={setQty} />
    </main>
  );
}

type Filter = "all" | "needed" | "gifted";

function readOpen(key: string): Category[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]") as Category[];
  } catch {
    return [];
  }
}

/**
 * The list, one category per row. Closed, a category shows its count, subtotal, and a few photos,
 * so the whole registry fits on about a screen. Which ones are open is remembered on this device.
 */
function ItemList({
  registryId,
  items,
  setStatus,
  setQty,
}: {
  registryId: string;
  items: RegistryItem[];
  setStatus: (itemId: string, status: ItemStatus) => Promise<void>;
  setQty: (itemId: string, qty: number) => Promise<void>;
}) {
  const storageKey = `calm-registry:open:${registryId}`;
  const [open, setOpen] = useState<Category[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [removed, setRemoved] = useState<{ item: RegistryItem; status: ItemStatus } | null>(null);

  useEffect(() => setOpen(readOpen(storageKey)), [storageKey]);

  useEffect(() => {
    if (!removed) return;
    const timer = setTimeout(() => setRemoved(null), 6000);
    return () => clearTimeout(timer);
  }, [removed]);

  function save(next: Category[]) {
    setOpen(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Open categories just won't be remembered.
    }
  }

  function toggle(category: Category) {
    save(open.includes(category) ? open.filter((c) => c !== category) : [...open, category]);
  }

  function remove(item: RegistryItem) {
    setRemoved({ item, status: item.status });
    void setStatus(item.id, "skip");
  }

  function undo() {
    if (!removed) return;
    void setStatus(removed.item.id, removed.status);
    setRemoved(null);
  }

  const gifted = items.filter((i) => i.purchased).length;
  const shown = filter === "all" ? items : items.filter((i) => (filter === "gifted" ? i.purchased : !i.purchased));
  const groups = CATEGORIES.map((category) => ({ category, items: shown.filter((i) => i.category === category) })).filter(
    (g) => g.items.length > 0,
  );
  const allOpen = groups.every((g) => open.includes(g.category));

  return (
    <div className="mt-12 lg:mt-0">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 pb-4">
        {gifted > 0 ? (
          <div role="group" aria-label="Show" className="flex gap-1 rounded-xl bg-surface p-1 text-[14px]">
            {(
              [
                ["all", `All ${items.length}`],
                ["needed", `Still needed ${items.length - gifted}`],
                ["gifted", `Gifted ${gifted}`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-1.5 tabular-nums transition-colors ${
                  filter === value ? "bg-bg font-semibold text-text shadow-[0_0_0_1px_var(--line)]" : "text-muted hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="font-semibold">Your list</h2>
        )}
        {filter === "all" && (
          <button className="link text-[13px]" onClick={() => save(allOpen ? [] : groups.map((g) => g.category))}>
            {allOpen ? "Close all" : "Open all"}
          </button>
        )}
      </div>

      {groups.length === 0 && <p className="border-t border-line py-6 text-muted">Nothing here yet.</p>}

      <div className="border-t border-line">
        {groups.map(({ category, items }) => {
          // Filtering shows the matching items, so every category opens.
          const expanded = filter !== "all" || open.includes(category);
          const subtotal = items.reduce((sum, i) => sum + totalPrice(i.offers, i.qty), 0);
          const giftedHere = items.filter((i) => i.purchased).length;
          const panel = `cat-panel-${category}`;
          return (
            <section key={category} aria-labelledby={`cat-${category}`} className="border-b border-line">
              <h2 id={`cat-${category}`}>
                <button
                  aria-expanded={expanded}
                  aria-controls={panel}
                  onClick={() => toggle(category)}
                  disabled={filter !== "all"}
                  className="group flex w-full items-center gap-4 py-4 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-[21px] font-semibold transition-colors group-hover:text-accent">
                      {category}
                    </span>
                    <span className="block text-[13px] text-muted tabular-nums">
                      {items.length} {items.length === 1 ? "item" : "items"}
                      {subtotal > 0 && `, ${money(subtotal)}`}
                      {filter === "all" && giftedHere > 0 && `, ${giftedHere} gifted`}
                    </span>
                  </span>
                  {!expanded && (
                    <span className="flex shrink-0 gap-1.5" aria-hidden>
                      {items.filter((i) => i.offers[0]?.imageUrl).slice(0, 5).map((item, n) => (
                        <ProductPhoto
                          key={item.id}
                          offer={item.offers[0]}
                          label=""
                          className={`h-10 w-10 rounded-[10px] sm:h-12 sm:w-12 ${n >= 3 ? "hidden sm:flex" : ""}`}
                        />
                      ))}
                    </span>
                  )}
                  {filter === "all" && (
                    <svg
                      viewBox="0 0 20 20"
                      aria-hidden
                      className={`h-4 w-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
                    >
                      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </h2>
              {expanded && (
                <ul id={panel} className="pb-2 md:grid md:grid-cols-2 md:gap-x-8 lg:grid-cols-1 xl:grid-cols-2 xl:gap-x-10 2xl:grid-cols-3 2xl:gap-x-8">
                  {items.map((item) => (
                    <ItemRow key={item.id} item={item} onRemove={() => remove(item)} onQty={(qty) => void setQty(item.id, qty)} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {removed && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-24 z-30 mx-auto flex max-w-md items-center justify-between gap-4 rounded-xl bg-room px-4 py-3 text-room-text shadow-[0_8px_24px_rgb(58_49_80/0.12)] lg:bottom-8"
        >
          <span className="min-w-0 truncate">Removed {removed.item.name}</span>
          <button className="shrink-0 font-semibold underline underline-offset-4" onClick={undo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

const MAX_QTY = 20;

/**
 * The product itself leads: its photo and name open the store page, with price and store right under it.
 * The reason and ratings belong to the keep-or-skip step, not this list.
 */
function ItemRow({ item, onRemove, onQty }: { item: RegistryItem; onRemove: () => void; onQty: (qty: number) => void }) {
  const primary = item.offers[0];
  // A search link stands in when no exact product was found, so the item's own name leads instead.
  const product = primary && !primary.externalId.startsWith("search:") ? primary : null;
  const store = primary ? RETAILER_LABELS[primary.retailer] : null;
  const price = product?.price ?? null;
  const link = { target: "_blank", rel: "noopener noreferrer sponsored" } as const;

  return (
    <li className="flex gap-4 border-t border-line py-4">
      {primary ? (
        <a href={primary.url} {...link} tabIndex={-1} aria-hidden className="shrink-0">
          <ProductPhoto offer={primary} label={item.name} className="h-[72px] w-[72px] sm:h-20 sm:w-20" />
        </a>
      ) : (
        <ProductPhoto offer={primary} label={item.name} className="h-[72px] w-[72px] sm:h-20 sm:w-20" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        {primary ? (
          <a href={primary.url} {...link} className="line-clamp-2 leading-snug font-medium hover:underline hover:decoration-line hover:underline-offset-4">
            {product?.title ?? item.name}
          </a>
        ) : (
          <p className="leading-snug font-medium">{item.name}</p>
        )}
        <p className="text-[14px] text-muted tabular-nums">
          {price !== null
            ? `${formatPrice(price)}${item.qty > 1 ? " each" : ""} at ${store}`
            : store
              ? `Find it at ${store}`
              : "No store yet"}
        </p>
        <div className="flex items-center gap-4 pt-1.5 text-[13px]">
          {item.purchased ? (
            <span className="rounded-md bg-gift-bg px-2 py-0.5 text-gift">
              {item.qty > 1 ? `${item.qty}, gifted` : "Gifted"}
              {item.purchased.buyerName ? ` by ${item.purchased.buyerName}` : ""}
            </span>
          ) : (
            <>
              <QtyStepper name={item.name} qty={item.qty} onChange={onQty} />
              <button className="text-muted hover:text-text" onClick={onRemove} aria-label={`Remove ${item.name}`}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function QtyStepper({ name, qty, onChange }: { name: string; qty: number; onChange: (qty: number) => void }) {
  const step = "grid h-8 w-8 place-items-center rounded-full text-[17px] text-muted transition-colors hover:bg-raise hover:text-text disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div role="group" aria-label={`How many ${name}`} className="flex items-center rounded-full border border-line">
      <button className={step} onClick={() => onChange(qty - 1)} disabled={qty <= 1} aria-label={`One fewer ${name}`}>
        −
      </button>
      <span className="w-7 text-center text-[14px] text-text tabular-nums" aria-live="polite">
        {qty}
      </span>
      <button className={step} onClick={() => onChange(qty + 1)} disabled={qty >= MAX_QTY} aria-label={`One more ${name}`}>
        +
      </button>
    </div>
  );
}

function useShare(slug: string) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? `/r/${slug}` : `${window.location.origin}/r/${slug}`;

  async function share() {
    if (navigator.share) {
      await navigator.share({ title: "Our baby registry", url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return { url, copied, share };
}

/** The next step once everything is reviewed. */
function ShareCard({ slug }: { slug: string }) {
  const { url, copied, share } = useShare(slug);
  return (
    <div className="space-y-4 rounded-2xl bg-surface p-5">
      <div className="min-w-0 space-y-1">
        <p className="font-serif text-[19px] font-semibold">Share with family and friends</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-[14px] text-muted hover:text-text">
          {url.replace(/^https?:\/\//, "")}
        </a>
      </div>
      <button className="btn-primary w-full" onClick={() => void share()}>
        {copied ? "Link copied" : "Share link"}
      </button>
    </div>
  );
}

/** Share link while still reviewing: there, but not the next step. */
function ShareLine({ slug }: { slug: string }) {
  const { url, copied, share } = useShare(slug);
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 text-[14px]">
        <p className="font-semibold">Share link</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="block truncate text-muted hover:text-text">
          {url.replace(/^https?:\/\//, "")}
        </a>
      </div>
      <button className="btn-quiet shrink-0 px-4 py-2" onClick={() => void share()}>
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Names, address, answers, and the rare actions, folded into one row until they're needed. */
function RegistrySettings({ registry, onSaved }: { registry: Registry; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const reviewing = registry.items.some((i) => i.status === "pending");
  return (
    <section className="space-y-6" aria-label="Registry settings">
      <button
        className="flex w-full items-center justify-between gap-4 border-y border-line py-3.5 text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="min-w-0">
          <span className="block font-semibold">Registry settings</span>
          <span className="block text-[13px] text-muted">Names, shipping address, your answers{reviewing ? ", share link" : ""}</span>
        </span>
        <svg viewBox="0 0 20 20" aria-hidden className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Closed, this still shows address requests, since those need an answer. */}
      <RegistryDetails registry={registry} onSaved={onSaved} open={open} />
      {open && (
        <div className="space-y-8">
          {reviewing && <ShareLine slug={registry.slug} />}
          <YourAnswers registry={registry} onSaved={onSaved} />
          <div className="flex flex-col items-start gap-3 border-t border-line pt-5">
            <Link href={`/start?from=${registry.id}`} className="link text-[13px]">
              Start a new registry using these answers
            </Link>
            <StartOverLink registry={registry} />
            <DeleteRegistry registry={registry} />
          </div>
        </div>
      )}
    </section>
  );
}

const SUGGESTIONS = ["Make it cheaper", "We already have a crib", "More eco-friendly", "Add a baby swing"];

/** Change the registry by describing it. One button until it's used; pinned to the bottom of the screen on phones. */
function EditBar({ registry, onApplied }: { registry: Registry; onApplied: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [diff, setDiff] = useState<EditDiff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const names = new Map(registry.items.map((i) => [i.id, i.name]));

  async function requestDiff(request: string) {
    const { diff } = await api<{ diff: EditDiff }>(`/api/registries/${registry.id}/edit`, {
      method: "POST",
      body: JSON.stringify({ request }),
    });
    setDiff(diff);
    return diff;
  }

  async function applyDiff(pending: EditDiff) {
    await api(`/api/registries/${registry.id}/edit`, { method: "POST", body: JSON.stringify({ diff: pending }) });
    setDiff(null);
    setText("");
    setOpen(false);
    await onApplied();
  }

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That change didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function propose(request: string) {
    if (request.trim()) void run(() => requestDiff(request));
  }

  function apply() {
    if (diff) void run(() => applyDiff(diff));
  }

  const hasChanges = diff && (diff.add.length || diff.remove.length || diff.swap.length);
  const expanded = open || Boolean(diff) || busy;

  function close() {
    setOpen(false);
    setText("");
    setError("");
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/95 backdrop-blur lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:backdrop-blur-none">
      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 lg:max-w-none lg:p-0">
        {!expanded ? (
          <button className="btn-quiet w-full justify-start" onClick={() => setOpen(true)}>
            Change your registry
          </button>
        ) : (
        <>
        {!diff && (
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-semibold">Change your registry</p>
            <button className="link text-[13px]" onClick={close} disabled={busy}>
              Close
            </button>
          </div>
        )}
        {diff && (
          <div className="max-h-[45dvh] space-y-3 overflow-y-auto rounded-xl bg-surface p-4">
            <p className="font-serif text-[17px] text-note italic">{diff.summary}</p>
            <ul className="space-y-1 text-[14px]">
              {diff.remove.map((id) => (
                <li key={id}>Remove {names.get(id)}</li>
              ))}
              {diff.add.map((item) => (
                <li key={item.name}>Add {item.name}</li>
              ))}
              {diff.swap.map((s) => (
                <li key={s.id}>Find a different {names.get(s.id)?.toLowerCase()}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button className="btn-quiet flex-1 py-2.5" onClick={() => setDiff(null)} disabled={busy}>
                Cancel
              </button>
              {hasChanges ? (
                <button className="btn-primary flex-1 py-2.5" onClick={apply} disabled={busy}>
                  {busy ? "Applying…" : "Apply changes"}
                </button>
              ) : null}
            </div>
          </div>
        )}
        {!diff && !text && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="chip shrink-0 py-1.5 text-[13px]"
                disabled={busy}
                onClick={() => {
                  setText(s);
                  propose(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            propose(text);
          }}
          className="flex gap-2 lg:flex-wrap"
        >
          <label htmlFor="edit-request" className="sr-only">
            Describe a change
          </label>
          <input
            id="edit-request"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's changed?"
            className="field lg:basis-full"
          />
          <button className="btn-primary shrink-0 lg:flex-1" disabled={busy || !text.trim()}>
            {busy && !diff ? "Thinking…" : "Change"}
          </button>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
