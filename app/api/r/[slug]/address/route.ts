import { createHash, randomBytes } from "node:crypto";
import { registryStore, RegistryError } from "@/lib/registry-store";
import { AddressRequestInputSchema } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ slug: string }> };

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** A gift giver asks for the shipping address. Returns a secret only their browser keeps. */
export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const parsed = AddressRequestInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Add your name and an email or phone number so the parents know who's asking." }, { status: 400 });
  }
  const token = randomBytes(24).toString("base64url");
  try {
    const id = await registryStore().createAddressRequest(slug, parsed.data, hash(token));
    return Response.json({ id, token });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Your request didn't send. Try again." }, { status: 409 });
  }
}

/** ?id=&token= -> { status, address } where address is only present once approved. */
export async function GET(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!id || !token) return Response.json({ error: "Missing request." }, { status: 400 });
  try {
    const result = await registryStore().getRequestForRequester(slug, id, hash(token));
    if (!result) return Response.json({ error: "Request not found." }, { status: 404 });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof RegistryError ? error.message : "Couldn't check your request." }, { status: 503 });
  }
}
