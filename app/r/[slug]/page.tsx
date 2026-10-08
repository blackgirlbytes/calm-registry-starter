"use client";

import { use, useCallback, useEffect, useState } from "react";
import { AddressAsk } from "@/components/AddressAsk";
import { ProductPhoto } from "@/components/ProductPhoto";
import { Status } from "@/components/Status";
import { formatPrice, getBrowserSupabase } from "@/lib/client";
import { CATEGORIES, RETAILER_LABELS, type Registry, type RegistryItem, type RetailerId } from "@/lib/types";

type PublicRegistry = Omit<Registry, "ownerId" | "profile">;

const POLL_MS = 15000;

export default function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return (
    <div data-theme="day">
      <Gifts slug={slug} />
    </div>
  );
}

function Gifts({ slug }: { slug: string }) {
  const [registry, setRegistry] = useState<PublicRegistry | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/r/${slug}`, { cache: "no-store" });
    const data = (await response.json()) as { registry?: PublicRegistry; error?: string };
    if (data.registry) setRegistry(data.registry);
    else setError(data.error ?? "This registry link doesn't work. Ask the parents for a new one.");
  }, [slug]);

  useEffect(() => {
    void load();
    // Poll even when realtime is available, so the page still updates if broadcasts are down.
    const timer = setInterval(() => void load(), POLL_MS);
    const supabase = getBrowserSupabase();
    const channel = supabase
      ?.channel(`registry:${slug}`)
      .on("broadcast", { event: "registry_changed" }, () => void load())
      .subscribe();
    return () => {
      clearInterval(timer);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [load, slug]);

  if (error) return <Status>{error}</Status>;
  if (!registry) return <Status>Opening the registry…</Status>;

  const open = registry.items.filter((i) => !i.purchased);
  const gifted = registry.items.filter((i) => i.purchased);

  return (
    <main className="space-y-12 pt-10 lg:pt-16">
      <header className="max-w-2xl space-y-3">
        <h1 className="font-serif text-[33px] leading-tight font-semibold lg:text-[48px] lg:leading-[1.1]">{registry.title}</h1>
        <p className="text-muted">
          {registry.dueDate &&
            `Due ${new Date(registry.dueDate + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" })}. `}
          {gifted.length} of {registry.items.length} gifted so far.
        </p>
        {registry.familyNote && (
          <p className="max-w-[52ch] font-serif text-[17px] leading-relaxed whitespace-pre-line">
            {registry.familyNote}
            {registry.parentNames && <span className="mt-1 block text-muted not-italic">{registry.parentNames}</span>}
          </p>
        )}
        <p className="max-w-[52ch] font-serif text-[17px] leading-relaxed text-note italic">
          Buy from any store you like. When you do, mark it here so nobody else buys the same thing.
        </p>
      </header>

      {registry.hasAddress && <AddressAsk slug={slug} who={registry.parentNames || "the parents"} />}

      {CATEGORIES.map((category) => {
        const items = open.filter((i) => i.category === category);
        if (!items.length) return null;
        return (
          <section key={category} aria-labelledby={`gift-${category}`}>
            <h2 id={`gift-${category}`} className="border-b border-line pb-3 font-serif text-[21px] font-semibold">
              {category}
            </h2>
            <ul className="grid gap-x-8 sm:grid-cols-2 sm:gap-y-4 lg:grid-cols-3 2xl:grid-cols-4">
              {items.map((item) => (
                <GiftRow key={item.id} item={item} slug={slug} onBought={load} />
              ))}
            </ul>
          </section>
        );
      })}

      {gifted.length > 0 && (
        <section aria-labelledby="gift-done">
          <h2 id="gift-done" className="border-b border-line pb-3 font-serif text-[21px] font-semibold">
            Already gifted
          </h2>
          <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {gifted.map((item) => (
              <li key={item.id} className="flex items-center gap-4 border-b border-line py-3 text-muted">
                <ProductPhoto offer={item.offers[0]} label={item.name} className="h-12 w-12 opacity-70" />
                <span className="flex-1">{item.name}</span>
                <span className="rounded-md bg-gift-bg px-2 py-0.5 text-[13px] text-gift">Gifted</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function GiftRow({ item, slug, onBought }: { item: RegistryItem; slug: string; onBought: () => Promise<void> }) {
  const [confirming, setConfirming] = useState<RetailerId | "elsewhere" | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const primary = item.offers[0];

  async function markBought() {
    setError("");
    const response = await fetch(`/api/r/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId: item.id, buyerName: name, retailer: confirming === "elsewhere" ? null : confirming }),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) setError(data.error ?? "This gift couldn't be marked. Try again.");
    setConfirming(null);
    await onBought();
  }

  return (
    <li className="flex flex-col gap-4 border-b border-line py-5 sm:border-0 sm:pt-6 sm:pb-2">
      <div className="flex gap-4 sm:flex-col">
        <ProductPhoto offer={primary} label={item.name} className="h-24 w-24 sm:aspect-[4/3] sm:h-auto sm:w-full" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">
            {item.name}
            {item.qty > 1 && <span className="font-normal text-muted"> ×{item.qty}</span>}
          </p>
          {primary && <p className="line-clamp-2 text-[13px] text-muted">{primary.title}</p>}
        </div>
      </div>

      {confirming ? (
        <div className="space-y-3 rounded-xl bg-surface p-4 sm:mt-auto" style={{ boxShadow: "0 0 0 1px var(--line)" }}>
          <p>Did you buy it? Marking it lets everyone know it&apos;s covered.</p>
          <label htmlFor={`buyer-${item.id}`} className="sr-only">
            Your name
          </label>
          <input
            id={`buyer-${item.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className="field"
          />
          <div className="flex gap-2">
            <button className="btn-quiet flex-1 py-2.5" onClick={() => setConfirming(null)}>
              Not yet
            </button>
            <button className="btn-primary flex-1 py-2.5" onClick={() => void markBought()}>
              Mark as bought
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 sm:mt-auto">
          {/* Only the product the parents chose: other offers can be different products. */}
          {primary && (
            <a
              href={primary.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              onClick={() => setConfirming(primary.retailer)}
              className="btn-primary px-4 py-2 text-[14px]"
            >
              {primary.price === null
                ? `Shop at ${RETAILER_LABELS[primary.retailer]}`
                : `${formatPrice(primary.price)} at ${RETAILER_LABELS[primary.retailer]}`}
            </a>
          )}
          <button className="link ml-1 text-[13px]" onClick={() => setConfirming("elsewhere")}>
            I bought it somewhere else
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
    </li>
  );
}
