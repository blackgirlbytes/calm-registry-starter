import { getOwnerId, unauthorized } from "@/lib/auth";
import { registryStore, RegistryError } from "@/lib/registry-store";
import { AddressSchema, DetailsSchema } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function ownedRegistry(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return { response: unauthorized() };
  const registry = await registryStore().getById(id);
  if (!registry || registry.ownerId !== ownerId) {
    return { response: Response.json({ error: "Registry not found." }, { status: 404 }) };
  }
  return { registry, ownerId };
}

function failure(error: unknown, status = 409) {
  return Response.json({ error: error instanceof RegistryError ? error.message : "That didn't save. Try again." }, { status });
}

/** Owner-only: the private address and everyone who asked for it. */
export async function GET(request: Request, context: RouteContext) {
  try {
    const owned = await ownedRegistry(request, context);
    if (owned.response) return owned.response;
    const store = registryStore();
    const [address, requests] = await Promise.all([
      store.getAddress(owned.registry.id),
      store.listAddressRequests(owned.registry.id),
    ]);
    return Response.json({ address, requests }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, 503);
  }
}

/** { details, address } where address null removes it. */
export async function PUT(request: Request, context: RouteContext) {
  const body = (await request.json().catch(() => ({}))) as { details?: unknown; address?: unknown };
  const details = DetailsSchema.safeParse(body.details);
  if (!details.success) return Response.json({ error: "Give the registry a title (up to 80 characters)." }, { status: 400 });
  const address = body.address === null ? null : AddressSchema.safeParse(body.address);
  if (address && !address.success) {
    return Response.json({ error: "Add a name, street, and city for the shipping address, or clear it." }, { status: 400 });
  }

  try {
    const owned = await ownedRegistry(request, context);
    if (owned.response) return owned.response;
    const store = registryStore();
    await store.updateDetails(owned.registry.id, owned.ownerId, details.data);
    await store.setAddress(owned.registry.id, owned.ownerId, address ? address.data : null);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

/** { requestId, decision: "approved" | "declined" } */
export async function POST(request: Request, context: RouteContext) {
  const body = (await request.json().catch(() => ({}))) as { requestId?: unknown; decision?: unknown };
  if (typeof body.requestId !== "string" || (body.decision !== "approved" && body.decision !== "declined")) {
    return Response.json({ error: "Choose share or decline." }, { status: 400 });
  }
  try {
    const owned = await ownedRegistry(request, context);
    if (owned.response) return owned.response;
    await registryStore().decideAddressRequest(owned.registry.id, owned.ownerId, body.requestId, body.decision);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
