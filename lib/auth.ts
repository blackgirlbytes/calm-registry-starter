import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "./registry-store";

const LOCAL_OWNER_ID = "00000000-0000-0000-0000-000000000001";

export async function getOwnerId(request: Request): Promise<string | null> {
  if (!isSupabaseConfigured()) return LOCAL_OWNER_ID;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export function unauthorized() {
  return Response.json({ error: "Please sign in to continue." }, { status: 401 });
}
