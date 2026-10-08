import type { Offer } from "@/lib/types";

/**
 * A product photo on white with a thin border, so colors read true. Without a photo, a quiet outlined
 * tile names the item instead.
 */
export function ProductPhoto({ offer, label, className = "" }: { offer?: Offer; label: string; className?: string }) {
  if (!offer?.imageUrl) {
    return (
      <div className={`flex shrink-0 items-center justify-center rounded-[18px] border border-dashed border-line ${className}`}>
        <span className="line-clamp-3 px-2 text-center font-serif text-[12px] leading-snug hyphens-auto text-muted">{label}</span>
      </div>
    );
  }
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-line bg-white ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={offer.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain p-[8%]" />
    </div>
  );
}
