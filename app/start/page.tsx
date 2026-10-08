"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnswersCard } from "@/components/AnswersCard";
import { AuthGate } from "@/components/AuthGate";
import { Building } from "@/components/Building";
import { api } from "@/lib/client";
import { essentialCount } from "@/lib/intake-steps";
import type { ChatMessage, IntakeDraft, ParentProfile } from "@/lib/types";

type Turn = { reply: string; chips: string[]; done: boolean; profile: ParentProfile | null };

/** Where answers lived before they were saved to the account; moved into a draft once. */
const LEGACY_STORAGE_KEY = "calm-registry:intake";

export default function StartPage() {
  return (
    <AuthGate reason="Sign in with your email first so your registry is saved. No password needed.">
      <IntakeChat />
    </AuthGate>
  );
}

/** Opens the draft named in the URL, or the one for ?registry= (starting over), ?from= (reusing answers), or ?new. */
async function openDraft(): Promise<IntakeDraft> {
  const params = new URLSearchParams(window.location.search);
  const draftId = params.get("draft");
  if (draftId) {
    const found = await api<{ draft: IntakeDraft }>(`/api/drafts/${draftId}`).catch(() => null);
    if (found) return found.draft;
  }
  const registryId = params.get("registry");
  const from = params.get("from");
  const body = registryId ? { registryId } : from ? { seedFrom: from } : { fresh: params.has("new") };
  return (await api<{ draft: IntakeDraft }>("/api/drafts", { method: "POST", body: JSON.stringify(body) })).draft;
}

function IntakeChat() {
  const router = useRouter();
  const [draft, setDraft] = useState<IntakeDraft | null>(null);
  const [registryTitle, setRegistryTitle] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chips, setChips] = useState<string[]>([]);
  const [profile, setProfile] = useState<ParentProfile | null>(null);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [building, setBuilding] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  useEffect(() => {
    void (async () => {
      try {
        const opened = await openDraft();
        let { messages, chips } = opened;
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy && !messages.length && !opened.registryId && !opened.seed) {
          ({ messages, chips } = JSON.parse(legacy) as { messages: ChatMessage[]; chips: string[] });
        }
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        router.replace(`/start?draft=${opened.id}`);
        setDraft(opened);
        setMessages(messages);
        setChips(chips);
        setProfile(opened.profile);
        loaded.current = true;
        if (opened.registryId) {
          const { registry } = await api<{ registry: { title: string } }>(`/api/registries/${opened.registryId}`);
          setRegistryTitle(registry.title);
        }
        if (!messages.length) await send([], opened);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Your answers couldn't be loaded.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saved to the account shortly after each change, so leaving midway never loses answers.
  useEffect(() => {
    if (!draft || !loaded.current) return;
    const timer = setTimeout(() => {
      // Building or cancelling deletes the draft; a save landing after that would fail.
      if (!loaded.current) return;
      void api(`/api/drafts/${draft.id}`, { method: "PUT", body: JSON.stringify({ messages, chips, profile }) }).catch(() => undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, messages, chips, profile]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chips, thinking, profile]);

  async function send(history: ChatMessage[], current = draft) {
    setThinking(true);
    setError("");
    try {
      const turn = await api<Turn>("/api/intake", {
        method: "POST",
        body: JSON.stringify({ messages: history, seed: current?.seed ?? undefined }),
      });
      setMessages([...history, { role: "assistant" as const, content: turn.reply }]);
      setChips(turn.done ? [] : turn.chips);
      if (turn.done && turn.profile) setProfile(turn.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setThinking(false);
    }
  }

  async function build() {
    if (!profile || !draft) return;
    loaded.current = false;
    setBuilding(true);
    try {
      const { id } = await api<{ id: string }>("/api/registries", {
        method: "POST",
        body: JSON.stringify({ profile, draftId: draft.id, registryId: draft.registryId ?? undefined }),
      });
      router.push(`/registry/${id}/review`);
    } catch (e) {
      loaded.current = true;
      setBuilding(false);
      setError(e instanceof Error ? e.message : "Your registry couldn't be built. Try again.");
    }
  }

  function answer(text: string) {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    const history = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(history);
    setChips([]);
    setInput("");
    void send(history);
  }

  /** Changing an earlier answer drops everything after it, so the chat picks up from there. */
  function saveEdit() {
    if (!editing || thinking) return;
    const text = editing.text.trim();
    if (!text) return;
    const history = [...messages.slice(0, editing.index), { role: "user" as const, content: text }];
    setEditing(null);
    setProfile(null);
    setMessages(history);
    setChips([]);
    void send(history);
  }

  function restart() {
    setConfirmRestart(false);
    setEditing(null);
    setProfile(null);
    setMessages([]);
    setChips([]);
    void send([]);
  }

  async function cancelStartOver() {
    if (!draft?.registryId) return;
    loaded.current = false;
    await api(`/api/drafts/${draft.id}`, { method: "DELETE" }).catch(() => undefined);
    router.push(`/registry/${draft.registryId}`);
  }

  if (building) return <Building />;

  const answered = messages.filter((m) => m.role === "user").length;
  const lastAnswer = messages.findLastIndex((m) => m.role === "user");
  const total = essentialCount(draft?.seed ?? null) + 1;
  const left = total - answered;

  return (
    <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
    <IntakeGuide answered={answered} total={total} />
    <div className="flex min-h-dvh flex-col pt-5 lg:pt-10">
      <header className="mb-8 space-y-2 text-[13px]">
        {draft?.registryId && (
          <div className="flex items-center justify-between gap-4">
            <span className="min-w-0 truncate">Starting over: {registryTitle || "your registry"}</span>
            <button onClick={() => void cancelStartOver()} className="link shrink-0">
              Keep my current list
            </button>
          </div>
        )}
        {confirmRestart ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3" role="alert">
            <span>Clear all your answers and start again?</span>
            <span className="flex gap-2">
              <button className="btn-quiet px-3 py-1.5 text-[13px]" onClick={() => setConfirmRestart(false)}>
                Keep them
              </button>
              <button className="btn-primary px-3 py-1.5 text-[13px]" onClick={restart}>
                Clear answers
              </button>
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-muted">
              {profile ? "Check your answers" : left > 1 ? `About ${left} questions left` : "Almost done"}
            </span>
            {answered > 0 && (
              <button onClick={() => setConfirmRestart(true)} className="link">
                Start over
              </button>
            )}
          </div>
        )}
      </header>

      <div className="flex-1 space-y-6" aria-live="polite">
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex flex-col items-end gap-1">
              {editing?.index === i ? (
                <form
                  className="w-full max-w-[80%] space-y-2 lg:max-w-[60%]"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit();
                  }}
                >
                  <label htmlFor="edit-answer" className="sr-only">
                    Change your answer
                  </label>
                  <textarea
                    id="edit-answer"
                    autoFocus
                    rows={2}
                    value={editing.text}
                    onChange={(e) => setEditing({ index: i, text: e.target.value })}
                    className="field resize-none"
                  />
                  <p className="text-[13px] text-muted">The questions after this one will be asked again.</p>
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn-quiet px-4 py-2" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <button className="btn-primary px-4 py-2" disabled={!editing.text.trim() || thinking}>
                      Save answer
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={thinking}
                    onClick={() => setEditing({ index: i, text: m.content })}
                    aria-label={`Change your answer: ${m.content}`}
                    className="max-w-[80%] rounded-2xl rounded-br-md bg-surface px-4 py-2.5 text-left transition-colors hover:bg-raise lg:max-w-[60%] lg:px-5 lg:py-3 lg:text-[17px]"
                  >
                    {m.content}
                  </button>
                  {i === lastAnswer && !thinking && (
                    <span className="text-[12px] text-muted">Tap any answer to change it</span>
                  )}
                </>
              )}
            </div>
          ) : (
            <p key={i} className="max-w-[65ch] font-serif text-[19px] leading-relaxed lg:text-[22px]">
              {m.content}
            </p>
          ),
        )}
        {thinking && <p className="font-serif text-[19px] text-muted">…</p>}
        {profile && !thinking && (
          <AnswersCard
            profile={profile}
            onChange={setProfile}
            title="Here's what you told me"
            intro="Tap anything that's not quite right. Nothing is built until you say so."
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button className="link text-left text-[13px]" onClick={() => setProfile(null)}>
                Something missing? Keep chatting
              </button>
              <button className="btn-primary sm:px-8" onClick={() => void build()}>
                {draft?.registryId ? "Rebuild my registry" : "Build my registry"}
              </button>
            </div>
          </AnswersCard>
        )}
        {error && (
          <p role="alert" className="text-[14px] text-danger">
            {error}{" "}
            <button className="underline underline-offset-4" onClick={() => void (profile ? build() : send(messages))}>
              Try again
            </button>
          </p>
        )}
        <div ref={bottom} />
      </div>

      {!profile && (
        <div className="sticky bottom-0 -mx-4 space-y-3 bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <button key={chip} className="chip" onClick={() => answer(chip)} disabled={thinking}>
                  {chip}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              answer(input);
            }}
            className="flex gap-2"
          >
            <label htmlFor="chat-input" className="sr-only">
              Your answer
            </label>
            <input
              id="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Or type your own answer"
              className="field"
            />
            <button className="btn-primary shrink-0" disabled={thinking || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </div>
    </div>
  );
}

const TOPICS = [
  "When your baby is due",
  "Boy, girl, or a surprise",
  "Your city, home, and who lives with you",
  "Feeding and going back to work",
  "What's already covered",
  "Stores you like",
  "Optional: a few quick personal touches",
];
const STEPS = ["Answer a few questions", "Review your draft", "Share with family"];

/** Laptop-only context beside the chat: where you are, and what the questions cover. */
function IntakeGuide({ answered, total }: { answered: number; total: number }) {
  const progress = Math.min(1, answered / total);
  return (
    <aside className="hidden space-y-10 pt-10 lg:sticky lg:top-0 lg:block lg:self-start">
      <p className="font-serif text-[17px] font-semibold">Calm Registry</p>

      <ol className="space-y-2">
        {STEPS.map((step, i) => (
          <li key={step} className={`flex gap-3 ${i === 0 ? "text-text" : "text-muted"}`}>
            <span className={`w-4 shrink-0 font-serif ${i === 0 ? "text-accent" : ""}`}>{i + 1}</span>
            {step}
          </li>
        ))}
      </ol>

      <div className="space-y-3">
        <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="text-[13px] text-muted">The questions cover</p>
        <ul className="space-y-1.5 text-[14px]">
          {TOPICS.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
