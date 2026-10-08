import { proposeEdit } from "@/lib/ai/edit";
import { describeChanges } from "@/lib/answers";
import { applyDiff } from "@/lib/apply-diff";
import { getOwnerId, unauthorized } from "@/lib/auth";
import { coerceProfile } from "@/lib/profile";
import { registryStore, RegistryError } from "@/lib/registry-store";
import { EditDiffSchema, type EditDiff } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

const NO_CHANGE: EditDiff = { summary: "", remove: [], add: [], swap: [] };

/**
 * { profile } -> { changes, diff }: how the list would change to fit the new answers. Nothing is saved.
 * { profile, diff } -> saves the answers and applies the previewed diff.
 */
export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOwnerId(request);
  if (!ownerId) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { profile?: unknown; diff?: unknown };
  // Pages opened before an update send older answers, so they're upgraded rather than rejected.
  if (!body.profile || typeof body.profile !== "object") return Response.json({ error: "Those answers aren't complete." }, { status: 400 });
  const profile = coerceProfile(body.profile);
  const store = registryStore();

  try {
    const registry = await store.getById(id);
    if (!registry || registry.ownerId !== ownerId) return Response.json({ error: "Registry not found." }, { status: 404 });

    if (body.diff === undefined) {
      const changes = describeChanges(registry.profile, profile);
      if (!changes.length) return Response.json({ changes, diff: NO_CHANGE });
      const request = `The parent updated their answers: ${changes.join("; ")}.
Update the list so it fits the new answers. Remove items that no longer fit, add what's now needed,
and swap items whose product should change. Leave everything else alone.`;
      const diff = await proposeEdit({ ...registry, profile }, request);
      return Response.json({ changes, diff });
    }

    const parsedDiff = EditDiffSchema.safeParse(body.diff);
    if (!parsedDiff.success) return Response.json({ error: "Preview the change first." }, { status: 400 });
    const diff = parsedDiff.data;
    if (diff.add.length || diff.remove.length || diff.swap.length) await applyDiff(registry, ownerId, diff, profile);
    await store.updateProfile(id, ownerId, profile);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Answers update failed", error);
    return Response.json({ error: error instanceof RegistryError ? error.message : "Your answers didn't save. Try again?" }, { status: 502 });
  }
}
