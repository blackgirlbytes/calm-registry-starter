"use client";

import { useCallback, useEffect, useState } from "react";
import type { AddressRequestStatus, ShippingAddress } from "@/lib/types";

type Saved = { id: string; token: string };
type Result = { status: AddressRequestStatus; address: ShippingAddress | null };

const POLL_MS = 20000;
const storageKey = (slug: string) => `calm-registry:address-request:${slug}`;

function formatAddress(a: ShippingAddress) {
  return [a.recipient, a.line1, a.line2, [a.city, [a.region, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", "), a.country]
    .filter((line) => line?.trim())
    .join("\n");
}

/** Lets a gift giver ask for the shipping address; the parents approve each person. */
export function AddressAsk({ slug, who }: { slug: string; who: string }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", contact: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(slug));
    if (raw) setSaved(JSON.parse(raw) as Saved);
  }, [slug]);

  const check = useCallback(async () => {
    if (!saved) return;
    const response = await fetch(`/api/r/${slug}/address?id=${encodeURIComponent(saved.id)}&token=${encodeURIComponent(saved.token)}`, {
      cache: "no-store",
    });
    if (response.status === 404) {
      localStorage.removeItem(storageKey(slug));
      setSaved(null);
      setResult(null);
      return;
    }
    if (response.ok) setResult((await response.json()) as Result);
  }, [saved, slug]);

  useEffect(() => {
    if (!saved) return;
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(timer);
  }, [saved, check]);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/r/${slug}/address`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as Saved & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Your request didn't send. Try again.");
      const next = { id: data.id, token: data.token };
      localStorage.setItem(storageKey(slug), JSON.stringify(next));
      setSaved(next);
      setResult({ status: "pending", address: null });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your request didn't send. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const box = "max-w-xl space-y-3 rounded-xl bg-surface p-5";
  const ring = { boxShadow: "0 0 0 1px var(--line)" };

  if (saved && result?.status === "approved" && result.address) {
    const text = formatAddress(result.address);
    return (
      <div className={box} style={ring}>
        <p className="font-semibold">Ship gifts to</p>
        <p className="whitespace-pre-line">{text}</p>
        <button className="btn-quiet px-4 py-2 text-[14px]" onClick={() => void copy(text)}>
          {copied ? "Copied" : "Copy address"}
        </button>
        <p className="text-[13px] text-muted">Paste it as the shipping address when you check out.</p>
      </div>
    );
  }

  if (saved && result?.status === "declined") {
    return (
      <div className={box} style={ring}>
        <p>
          The address wasn&apos;t shared through the registry. Reach out to {who} directly, or have the gift sent to you and bring it
          along.
        </p>
      </div>
    );
  }

  if (saved) {
    return (
      <div className={box} style={ring}>
        <p className="font-semibold">Address requested</p>
        <p className="text-[14px] text-muted">
          {who.charAt(0).toUpperCase() + who.slice(1)} will see your request. Once it&apos;s approved, the address shows up right here. Come back to this page on
          this device to see it.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex max-w-xl flex-wrap items-center gap-3">
        <p className="text-[14px] text-muted">Shipping a gift?</p>
        <button className="btn-quiet px-4 py-2 text-[14px]" onClick={() => setOpen(true)}>
          Ask for the shipping address
        </button>
      </div>
    );
  }

  return (
    <form
      className={box}
      style={ring}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <p className="font-semibold">Ask for the shipping address</p>
      <p className="text-[14px] text-muted">
        {who.charAt(0).toUpperCase() + who.slice(1)} will see who&apos;s asking and decide whether to share it.
      </p>
      <label className="block space-y-1.5">
        <span className="text-[13px] text-muted">Your name</span>
        <input
          className="field"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          maxLength={80}
          autoComplete="name"
          placeholder="Aunt Lisa"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] text-muted">Your email or phone, so they know it&apos;s you</span>
        <input
          className="field"
          value={form.contact}
          onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
          required
          minLength={3}
          maxLength={120}
          autoComplete="email"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-[13px] text-muted">A note (optional)</span>
        <input
          className="field"
          value={form.message}
          onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
          maxLength={300}
          placeholder="Sending the stroller!"
        />
      </label>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="btn-quiet flex-1 py-2.5" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button className="btn-primary flex-1 py-2.5" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </button>
      </div>
    </form>
  );
}
