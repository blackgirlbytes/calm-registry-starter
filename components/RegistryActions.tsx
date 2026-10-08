"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnswersCard } from "@/components/AnswersCard";
import { describeAnswers } from "@/lib/answers";
import { api } from "@/lib/client";
import type { EditDiff, ParentProfile, Registry } from "@/lib/types";

type Preview = { changes: string[]; diff: EditDiff };

/** The answers the list was built from. Changing them previews how the list would change before anything is saved. */
export function YourAnswers({ registry, onSaved }: { registry: Registry; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<ParentProfile | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const names = new Map(registry.items.map((i) => [i.id, i.name]));

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setDraft(null);
    setPreview(null);
    setError("");
  }

  if (!draft) {
    const plain = describeAnswers(registry.profile);
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1 text-[14px]">
          <p className="font-semibold">Your answers</p>
          <p className="text-muted">{[plain.baby, plain.home, plain.hasCar, plain.feeding].join(", ")}</p>
        </div>
        <button className="btn-quiet shrink-0 px-4 py-2.5" onClick={() => setDraft(registry.profile)}>
          Change answers
        </button>
      </div>
    );
  }

  const listChanges = preview ? preview.diff.remove.length + preview.diff.add.length + preview.diff.swap.length : 0;

  return (
    <AnswersCard
      profile={draft}
      onChange={(next) => {
        setDraft(next);
        setPreview(null);
      }}
      showNames={false}
      title="Your answers"
      intro="Change anything, then see how your list would change. Nothing is saved until you apply it."
    >
      {preview && (
        <div className="space-y-2 rounded-xl bg-raise p-4 text-[14px]" aria-live="polite">
          {preview.changes.length === 0 ? (
            <p>You haven&apos;t changed anything yet.</p>
          ) : listChanges === 0 ? (
            <p>Your list already fits these answers. Save them to keep them.</p>
          ) : (
            <>
              <p className="font-serif text-[16px] text-note italic">{preview.diff.summary}</p>
              <ul className="space-y-1">
                {preview.diff.remove.map((id) => (
                  <li key={id}>Remove {names.get(id)}</li>
                ))}
                {preview.diff.add.map((item) => (
                  <li key={item.name}>Add {item.name}</li>
                ))}
                {preview.diff.swap.map((s) => (
                  <li key={s.id}>Find a different {names.get(s.id)?.toLowerCase()}</li>
                ))}
              </ul>
              <p className="text-[13px] text-muted">Gifted items always stay.</p>
            </>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button className="btn-quiet flex-1 py-2.5" onClick={close} disabled={busy}>
          Cancel
        </button>
        {preview && preview.changes.length > 0 ? (
          <button
            className="btn-primary flex-1 py-2.5"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api(`/api/registries/${registry.id}/answers`, {
                  method: "POST",
                  body: JSON.stringify({ profile: draft, diff: preview.diff }),
                });
                close();
                await onSaved();
              })
            }
          >
            {busy ? "Saving…" : listChanges ? "Apply changes" : "Save answers"}
          </button>
        ) : (
          <button
            className="btn-primary flex-1 py-2.5"
            disabled={busy || Boolean(preview)}
            onClick={() =>
              void run(async () => {
                setPreview(
                  await api<Preview>(`/api/registries/${registry.id}/answers`, {
                    method: "POST",
                    body: JSON.stringify({ profile: draft }),
                  }),
                );
              })
            }
          >
            {busy ? "Checking your list…" : "Preview changes"}
          </button>
        )}
      </div>
    </AnswersCard>
  );
}

/** An inline "are you sure" so a stray tap never starts over or deletes anything. */
function Confirm({
  prompt,
  detail,
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  prompt: string;
  detail: string;
  action: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl bg-surface p-4" role="alertdialog" aria-label={prompt}>
      <p className="font-semibold">{prompt}</p>
      <p className="text-[14px] text-muted">{detail}</p>
      <div className="flex gap-2">
        <button className="btn-quiet flex-1 py-2.5" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" onClick={onConfirm} disabled={busy}>
          {action}
        </button>
      </div>
    </div>
  );
}

function giftedCount(registry: Registry) {
  return registry.items.filter((i) => i.purchased).length;
}

export function StartOverLink({ registry, label = "Start this registry over" }: { registry: Registry; label?: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const gifted = giftedCount(registry);

  if (!asking) {
    return (
      <button className="link text-[13px]" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <Confirm
      prompt="Start this registry over?"
      detail={`You'll answer the questions again and get a fresh list. Your share link, names, note, and address stay${
        gifted ? `, and the ${gifted === 1 ? "gift" : `${gifted} gifts`} already bought stay on the list` : ""
      }.`}
      action="Start over"
      onCancel={() => setAsking(false)}
      onConfirm={() => router.push(`/start?registry=${registry.id}`)}
    />
  );
}

export function DeleteRegistry({ registry }: { registry: Registry }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const gifted = giftedCount(registry);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/registries/${registry.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) });
      router.push("/");
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "It couldn't be deleted. Try again.");
    }
  }

  if (!asking) {
    return (
      <button className="link text-[13px]" onClick={() => setAsking(true)}>
        Delete registry
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <Confirm
        prompt={`Delete ${registry.title}?`}
        detail={`The share link will stop working${
          gifted ? ` and the record of ${gifted === 1 ? "1 gift" : `${gifted} gifts`} will be lost` : ""
        }. This can't be undone.`}
        action={busy ? "Deleting…" : "Delete"}
        busy={busy}
        onCancel={() => setAsking(false)}
        onConfirm={() => void remove()}
      />
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
