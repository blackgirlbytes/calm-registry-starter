import "server-only";
import { findOffers, mapLimit } from "./retail/aggregator";
import type { GeneratedItem, ParentProfile } from "./types";
import type { NewItem } from "./registry-store";

const LEAN_MAX_PRICE = 150;
const MAX_QTY = 20;

export function withOffers(items: GeneratedItem[], profile: ParentProfile): Promise<NewItem[]> {
  const maxPrice = profile.budget === "lean" ? LEAN_MAX_PRICE : undefined;
  return mapLimit(items, 6, async (item) => ({
    ...item,
    qty: Math.min(MAX_QTY, Math.max(1, Math.round(item.qty) || 1)),
    offers: await findOffers(item.searchQuery, profile.preferredRetailers, { maxPrice }),
  }));
}
