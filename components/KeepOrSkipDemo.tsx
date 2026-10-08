"use client";

import Link from "next/link";
import { useState } from "react";
import { ProductPhoto } from "@/components/ProductPhoto";
import { formatPrice } from "@/lib/format";
import { RETAILER_LABELS, type Offer } from "@/lib/types";

export type DemoItem = { name: string; category: string; priority: string; offer: Offer };

/** The review step, playable on the home page: keep or skip a few real products. Nothing is saved. */
export function KeepOrSkipDemo({ items }: { items: DemoItem[] }) {
  const [decisions, setDecisions] = useState<boolean[]>([]);
  const index = decisions.length;
  const current = items[index];
  const kept = items.filter((_, i) => decisions[i]);

  function decide(keep: boolean) {
    setDecisions((d) => [...d, keep]);
  }

  return (
    <section aria-labelledby="try-it" className="space-y-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="try-it" className="font-serif text-[21px] font-semibold">
          Try the review step
        </h2>
        {current && (
          <span className="text-[14px] text-muted tabular-nums" aria-live="polite">
            {index + 1} of {items.length}
          </span>
        )}
      </div>

      {current ? (
        <article key={index} className="animate-[card-in_.25s_ease-out] space-y-4">
          <ProductPhoto offer={current.offer} label={current.name} className="aspect-[4/3] w-full" />
          <div className="space-y-1">
            <p className="text-[14px] text-muted">
              {current.category}, {current.priority.toLowerCase()}
            </p>
            <h3 className="font-serif text-[26px] leading-tight font-semibold">{current.name}</h3>
          </div>
          <p className="flex items-baseline justify-between gap-4 rounded-xl border border-line px-4 py-3">
            <span className="min-w-0 truncate text-[15px]">{current.offer.title}</span>
            <span className="shrink-0 text-[15px] tabular-nums">
              <span className="font-semibold">{formatPrice(current.offer.price)}</span>
              <span className="text-muted"> at {RETAILER_LABELS[current.offer.retailer]}</span>
            </span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button className="btn-quiet" onClick={() => decide(false)}>
              Skip
            </button>
            <button className="btn-primary" onClick={() => decide(true)}>
              Keep
            </button>
          </div>
        </article>
      ) : (
        <div className="animate-[card-in_.25s_ease-out] space-y-4 rounded-2xl border border-line px-6 py-8">
          <p className="font-serif text-[26px] leading-tight font-semibold">
            You kept {kept.length} of {items.length}.
          </p>
          <p className="text-muted">
            Your real registry works the same way, with about 30 items picked from your answers.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
            <Link href="/start" className="btn-primary px-6">
              Start my registry
            </Link>
            <button className="link text-[14px]" onClick={() => setDecisions([])}>
              Try again
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-14 items-center gap-2" aria-label={`Kept so far: ${kept.map((k) => k.name).join(", ") || "nothing yet"}`}>
        {items.map((item, i) =>
          decisions[i] ? (
            <ProductPhoto key={item.name} offer={item.offer} label="" className="h-14 w-14 animate-[card-in_.25s_ease-out] rounded-[12px]" />
          ) : null,
        )}
        {kept.length === 0 && <p className="text-[14px] text-muted">What you keep collects here.</p>}
      </div>
    </section>
  );
}
