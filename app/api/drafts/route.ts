import { seedFrom } from "@/lib/answers";
import { getOwnerId, unauthorized } from "@/lib/auth";
import { registryStore, RegistryError } from "@/lib/registry-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();
  try {
    return Response.json({ drafts: await registryStore().listDrafts(ownerId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Could not load your answers." }, { status: 503 });
  }
}

type Body = { registryId?: unknown; seedFrom?: unknown; fresh?: unknown };

/**
 * Opens the saved answers for a new registry, or for starting `registryId` over.
 * Resumes what's there unless `fresh` is set; `seedFrom` starts fresh with another registry's lasting answers.
 */
export async function POST(request: Request) {
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();
  const body = (await request.json().catch(() => ({}))) as Body;
  const store = registryStore();

  const owned = async (id: unknown) => {
    if (typeof id !== "string") return null;
    const registry = await store.getById(id).catch(() => null);
    return registry?.ownerId === ownerId ? registry : null;
  };

  try {
    let registryId: string | null = null;
    if (body.registryId !== undefined) {
      const registry = await owned(body.registryId);
      if (!registry) return Response.json({ error: "Registry not found." }, { status: 404 });
      registryId = registry.id;
    }
    let seed;
    if (body.seedFrom !== undefined) {
      const source = await owned(body.seedFrom);
      if (!source) return Response.json({ error: "Registry not found." }, { status: 404 });
      seed = seedFrom(source.profile);
    }
    const draft = await store.openDraft(ownerId, registryId, { fresh: body.fresh === true, seed });
    return Response.json({ draft });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Could not start your answers." }, { status: 503 });
  }
}
