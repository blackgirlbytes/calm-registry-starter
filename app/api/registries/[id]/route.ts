import { getOwnerId, unauthorized } from "@/lib/auth";
import { registryStore, RegistryError } from "@/lib/registry-store";
import { findPick } from "@/lib/retail/aggregator";
import { PICK_REASON, type ItemStatus } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
type Action =
  | { action: "status"; itemId: string; status: ItemStatus }
  | { action: "primary"; itemId: string; offerId: string }
  | { action: "qty"; itemId: string; qty: number }
  | { action: "pick"; itemId: string; product: string };

const STATUSES: ItemStatus[] = ["pending", "keep", "skip"];
/** Matches the database check on registry_items.qty. */
const MAX_QTY = 20;

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();
  try {
    const registry = await registryStore().getById(id);
    if (!registry || registry.ownerId !== ownerId) return Response.json({ error: "Registry not found." }, { status: 404 });
    return Response.json({ registry }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Could not load registry." }, { status: 503 });
  }
}

/** Permanent. The browser must send { confirm: true } so a stray request can't delete a registry. */
export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as { confirm?: unknown };
  if (body.confirm !== true) return Response.json({ error: "Confirm before deleting." }, { status: 400 });
  try {
    await registryStore().deleteRegistry(id, ownerId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Could not delete." }, { status: 409 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();

  const input = (await request.json().catch(() => null)) as Action | null;
  try {
    const store = registryStore();
    if (input?.action === "status" && STATUSES.includes(input.status)) {
      await store.setItemStatus(id, ownerId, input.itemId, input.status);
    } else if (input?.action === "qty" && Number.isInteger(input.qty) && input.qty >= 1 && input.qty <= MAX_QTY) {
      await store.setItemQty(id, ownerId, input.itemId, input.qty);
    } else if (input?.action === "primary" && input.offerId) {
      await store.setPrimaryOffer(id, ownerId, input.itemId, input.offerId);
    } else if (input?.action === "pick" && typeof input.product === "string" && input.product.trim()) {
      const registry = await store.getById(id);
      const item = registry?.ownerId === ownerId ? registry.items.find((i) => i.id === input.itemId) : null;
      if (!registry || !item) return Response.json({ error: "That item is not on this registry." }, { status: 404 });
      if (item.purchased) return Response.json({ error: "Someone already bought this one." }, { status: 409 });
      const product = input.product.trim().replace(/\s+/g, " ").slice(0, 120);
      const offers = await findPick(product, registry.profile.preferredRetailers);
      await store.applyEdits(id, ownerId, [], [], [{ itemId: item.id, searchQuery: product, reason: PICK_REASON, offers }]);
    } else {
      return Response.json({ error: "Unknown action." }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Could not update." }, { status: 409 });
  }
}
