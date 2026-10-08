import { proposeEdit } from "@/lib/ai/edit";
import { applyDiff } from "@/lib/apply-diff";
import { getOwnerId, unauthorized } from "@/lib/auth";
import { registryStore, RegistryError } from "@/lib/registry-store";
import { EditDiffSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

/** { request } -> preview diff.  { diff } -> apply a previously previewed diff. */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { request?: string; diff?: unknown };
  const store = registryStore();

  try {
    const registry = await store.getById(id);
    if (!registry || registry.ownerId !== ownerId) return Response.json({ error: "Registry not found." }, { status: 404 });

    if (typeof body.request === "string" && body.request.trim()) {
      const diff = await proposeEdit(registry, body.request.slice(0, 500));
      return Response.json({ diff });
    }

    const parsed = EditDiffSchema.safeParse(body.diff);
    if (!parsed.success) return Response.json({ error: "Send a request or a diff." }, { status: 400 });
    await applyDiff(registry, ownerId, parsed.data);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Edit failed", error);
    return Response.json({ error: error instanceof RegistryError ? error.message : "That edit didn't go through. Try again?" }, { status: 502 });
  }
}
