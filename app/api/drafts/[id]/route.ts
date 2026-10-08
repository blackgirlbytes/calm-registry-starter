import { getOwnerId, unauthorized } from "@/lib/auth";
import { normalizeProfile } from "@/lib/profile";
import { registryStore, RegistryError } from "@/lib/registry-store";
import { DraftSaveSchema } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function failure(error: unknown, fallback: string) {
  return Response.json({ error: error instanceof RegistryError ? error.message : fallback }, { status: 409 });
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();
  try {
    const draft = await registryStore().getDraft(id, ownerId);
    if (!draft) return Response.json({ error: "Those answers were already used or cleared." }, { status: 404 });
    return Response.json({ draft }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error, "Could not load your answers.");
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();
  const parsed = DraftSaveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Those answers couldn't be saved." }, { status: 400 });
  try {
    const { profile, ...rest } = parsed.data;
    await registryStore().saveDraft(id, ownerId, { ...rest, profile: profile && normalizeProfile(profile) });
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error, "Your answers didn't save.");
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();
  try {
    await registryStore().deleteDraft(id, ownerId);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error, "Your answers couldn't be cleared.");
  }
}
