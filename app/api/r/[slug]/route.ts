import { registryStore, RegistryError } from "@/lib/registry-store";
import { RETAILERS, type Registry, type RetailerId } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

type PublicRegistry = Omit<Registry, "ownerId" | "profile">;

function toPublic(registry: Registry): PublicRegistry {
  const { ownerId: _owner, profile: _profile, ...rest } = registry;
  return {
    ...rest,
    items: rest.items
      .filter((i) => i.status !== "skip")
      .map((i) => ({ ...i, purchased: i.purchased ? { buyerName: null, retailer: null } : null })),
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  try {
    const registry = await registryStore().getBySlug(slug);
    if (!registry) return Response.json({ error: "Registry not found." }, { status: 404 });
    return Response.json({ registry: toPublic(registry) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Could not load registry." }, { status: 503 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { itemId?: string; buyerName?: string; retailer?: string };
  if (!body.itemId) return Response.json({ error: "Which item did you buy?" }, { status: 400 });
  const retailer = RETAILERS.includes(body.retailer as RetailerId) ? (body.retailer as RetailerId) : null;

  try {
    await registryStore().markPurchased(slug, body.itemId, body.buyerName?.slice(0, 80) ?? null, retailer);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Could not mark as purchased." }, { status: 409 });
  }
}
