import "server-only";
import { withOffers } from "./offers";
import { findOffers, mapLimit } from "./retail/aggregator";
import { registryStore } from "./registry-store";
import type { EditDiff, ParentProfile, Registry } from "./types";

/** Looks up products for a previewed diff and writes it. The profile decides budget filtering for new items. */
export async function applyDiff(registry: Registry, ownerId: string, diff: EditDiff, profile: ParentProfile = registry.profile) {
  const [added, swaps] = await Promise.all([
    withOffers(diff.add, profile),
    mapLimit(diff.swap, 6, async (swap) => ({
      itemId: swap.id,
      searchQuery: swap.searchQuery,
      reason: swap.reason,
      offers: await findOffers(swap.searchQuery, profile.preferredRetailers),
    })),
  ]);
  await registryStore().applyEdits(registry.id, ownerId, diff.remove, added, swaps);
}
