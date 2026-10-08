"use client";

import { formatPrice, PRIORITY_LABELS } from "@/lib/client";
import { RETAILER_LABELS, type RegistryItem } from "@/lib/types";
import { ProductPhoto } from "./ProductPhoto";
import { ProductRating } from "./ProductRating";

/** One item, shown large: used while reviewing the draft. */
export function ItemCard({
  item,
  onChooseOffer,
  children,
}: {
  item: RegistryItem;
  onChooseOffer?: (offerId: string) => void;
  children?: React.ReactNode;
}) {
  const [primary, ...alternatives] = item.offers;
  return (
    <article className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
      <ProductPhoto offer={primary} label={item.name} className="aspect-[4/3] w-full md:sticky md:top-28 md:aspect-square" />

      <div className="mt-6 space-y-4 md:mt-0">
        <div className="space-y-1">
          <p className="text-[14px] text-muted">
            {PRIORITY_LABELS[item.priority]}
            {item.qty > 1 && `, register for ${item.qty}`}
          </p>
          <h2 className="font-serif text-[26px] leading-tight font-semibold lg:text-[33px]">{item.name}</h2>
        </div>

        {primary && (
          <div className="space-y-2">
            <a
              href={primary.url}
              target="_blank"
              rel="noopener noreferrer sponsored"
              className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 transition-colors hover:bg-raise"
            >
              <span className="min-w-0">
                <span className="line-clamp-2 text-[15px] leading-snug">{primary.title}</span>
                {primary.price !== null && <span className="text-[14px] text-muted">{RETAILER_LABELS[primary.retailer]}</span>}
              </span>
              {primary.price !== null && (
                <span className="shrink-0 text-[17px] font-semibold tabular-nums">{formatPrice(primary.price)}</span>
              )}
            </a>
            <ProductRating offer={primary} />
          </div>
        )}

        {onChooseOffer && alternatives.length > 0 && (
          <div className="space-y-2">
            <p className="text-[14px] text-muted">Or choose a different one</p>
            <ul className="space-y-1">
              {alternatives.map((offer) => (
                <li key={offer.id}>
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-raise"
                    onClick={() => onChooseOffer(offer.id)}
                  >
                    <ProductPhoto offer={offer} label="" className="h-14 w-14 rounded-[12px]" />
                    <span className="min-w-0 flex-1 line-clamp-2 text-[15px] leading-snug">{offer.title}</span>
                    <span className="shrink-0 text-right text-[14px] text-muted tabular-nums">
                      {offer.price !== null && `${formatPrice(offer.price)} `}
                      {offer.price !== null ? `at ${RETAILER_LABELS[offer.retailer]}` : RETAILER_LABELS[offer.retailer]}
                    </span>
                  </button>
                  <ProductRating offer={offer} className="ml-[76px]" />
                </li>
              ))}
            </ul>
          </div>
        )}

        {children}
      </div>
    </article>
  );
}
