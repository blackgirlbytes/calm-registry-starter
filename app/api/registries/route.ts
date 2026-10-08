import { generateRegistry } from "@/lib/ai/generate";
import { getOwnerId, unauthorized } from "@/lib/auth";
import { withOffers } from "@/lib/offers";
import { coerceProfile } from "@/lib/profile";
import { registryStore, RegistryError } from "@/lib/registry-store";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();
  try {
    return Response.json({ registries: await registryStore().listForOwner(ownerId) });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Could not load registries." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { profile?: unknown; draftId?: unknown; registryId?: unknown };
  // Pages opened before an update send older answers, so they're upgraded rather than rejected.
  if (!body.profile || typeof body.profile !== "object") return Response.json({ error: "A valid profile is required." }, { status: 400 });

  try {
    const store = registryStore();
    const profile = coerceProfile(body.profile);
    let id: string;

    if (typeof body.registryId === "string") {
      // Starting over: same registry and share link, a fresh list around anything already gifted.
      const registry = await store.getById(body.registryId);
      if (!registry || registry.ownerId !== ownerId) return Response.json({ error: "Registry not found." }, { status: 404 });
      const gifted = new Set(registry.items.filter((i) => i.purchased).map((i) => i.name.toLowerCase()));
      const { items } = await generateRegistry(profile);
      const fresh = items.filter((i) => !gifted.has(i.name.toLowerCase()));
      await store.rebuild(registry.id, ownerId, profile, await withOffers(fresh, profile));
      id = registry.id;
    } else {
      const { title, items } = await generateRegistry(profile);
      id = await store.create({ ownerId, title, profile, items: await withOffers(items, profile) });
    }

    if (typeof body.draftId === "string") {
      await store.deleteDraft(body.draftId, ownerId).catch((error) => console.error("Draft cleanup failed", error));
    }
    return Response.json({ id });
  } catch (error) {
    console.error("Registry creation failed", error);
    return Response.json(
      { error: error instanceof RegistryError ? error.message : "We couldn't build your registry. Please try again." },
      { status: 502 },
    );
  }
}
