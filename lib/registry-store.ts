import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { coerceProfile, parseSeed } from "./profile";
import type {
  AddressRequest,
  AddressRequestStatus,
  ChatMessage,
  GeneratedItem,
  IntakeDraft,
  ItemStatus,
  Offer,
  ParentProfile,
  ProfileSeed,
  Registry,
  RegistryDetails,
  RegistryItem,
  RetailerId,
  ShippingAddress,
} from "./types";

export type DraftContent = { messages: ChatMessage[]; chips: string[]; profile: ParentProfile | null };
/** fresh clears any saved answers; seed also clears them and carries over answers from another registry. */
export type OpenDraftOptions = { fresh?: boolean; seed?: ProfileSeed | null };

export type AddressRequestInput = { name: string; contact: string; message: string };

export type NewItem = GeneratedItem & { offers: Offer[] };
export type OfferSwap = { itemId: string; searchQuery: string; reason: string; offers: Offer[] };

export type CreateRegistryInput = {
  ownerId: string;
  title: string;
  profile: ParentProfile;
  items: NewItem[];
};

export class RegistryError extends Error {}

function friendlyError(message: string | undefined) {
  if (message?.includes("REGISTRY_NOT_FOUND")) return "Registry not found.";
  if (message?.includes("ITEM_NOT_FOUND")) return "That item is not on this registry.";
  if (message?.includes("ALREADY_PURCHASED")) return "Someone already bought this one.";
  if (message?.includes("NO_ADDRESS")) return "The parents haven't added a shipping address yet.";
  if (message?.includes("TOO_MANY_REQUESTS")) return "The parents have a lot of requests waiting. Try reaching them directly.";
  if (message?.includes("REQUEST_NOT_FOUND")) return "That request no longer exists.";
  return "The registry could not be updated.";
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new RegistryError("Supabase storage is not configured.");
  supabaseAdmin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return supabaseAdmin;
}

function makeSlug(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "registry";
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `${base}-${suffix}`;
}

// ---------------------------------------------------------------------------
// Supabase implementation

type ItemRow = {
  id: string;
  name: string;
  category: RegistryItem["category"];
  priority: RegistryItem["priority"];
  reason: string;
  qty: number;
  status: ItemStatus;
  position: number;
  search_query: string;
  item_offers: Array<{
    id: string;
    retailer: RetailerId;
    external_id: string;
    title: string;
    price: number | string | null;
    image_url: string | null;
    url: string;
    rating: number | string | null;
    in_stock: boolean;
    is_primary: boolean;
  }>;
  purchases: Array<{ buyer_name: string | null; retailer: RetailerId | null }> | { buyer_name: string | null; retailer: RetailerId | null } | null;
};

type RegistryRow = {
  id: string;
  slug: string;
  owner_id: string;
  title: string;
  parent_names: string;
  baby_name: string;
  family_note: string;
  registry_addresses: { registry_id: string } | Array<{ registry_id: string }> | null;
  profile: ParentProfile;
  preferred_retailers: RetailerId[];
  due_date: string | null;
  revision: number | string;
  registry_items: ItemRow[];
};

const REGISTRY_SELECT =
  "id, slug, owner_id, title, parent_names, baby_name, family_note, profile, preferred_retailers, due_date, revision, registry_addresses(registry_id), registry_items(id, name, category, priority, reason, qty, status, position, search_query, item_offers(*), purchases(buyer_name, retailer))";

type AddressRequestRow = {
  id: string;
  requester_name: string;
  contact: string;
  message: string;
  status: AddressRequestStatus;
  created_at: string;
};

function toAddressRequest(row: AddressRequestRow): AddressRequest {
  return {
    id: row.id,
    name: row.requester_name,
    contact: row.contact,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DraftRow = {
  id: string;
  registry_id: string | null;
  messages: ChatMessage[];
  chips: string[];
  profile: ParentProfile | null;
  seed: ProfileSeed | null;
  updated_at: string;
};

const DRAFT_SELECT = "id, registry_id, messages, chips, profile, seed, updated_at";

function toDraft(row: DraftRow): IntakeDraft {
  return {
    id: row.id,
    registryId: row.registry_id,
    messages: row.messages ?? [],
    chips: row.chips ?? [],
    profile: row.profile ? coerceProfile(row.profile) : null,
    seed: parseSeed(row.seed),
    updatedAt: row.updated_at,
  };
}

function profileColumns(profile: ParentProfile) {
  return { p_profile: profile, p_preferred_retailers: profile.preferredRetailers, p_due_date: profile.dueDate };
}

function toRegistry(row: RegistryRow): Registry {
  const items = [...row.registry_items]
    .sort((a, b) => a.position - b.position)
    .map((item): RegistryItem => {
      const purchase = Array.isArray(item.purchases) ? item.purchases[0] : item.purchases;
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        priority: item.priority,
        reason: item.reason,
        qty: item.qty,
        status: item.status,
        position: item.position,
        searchQuery: item.search_query,
        offers: [...item.item_offers]
          .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
          .map((o) => ({
            id: o.id,
            retailer: o.retailer,
            externalId: o.external_id,
            title: o.title,
            price: o.price === null ? null : Number(o.price),
            imageUrl: o.image_url,
            url: o.url,
            rating: o.rating === null ? null : Number(o.rating),
            inStock: o.in_stock,
            isPrimary: o.is_primary,
          })),
        purchased: purchase ? { buyerName: purchase.buyer_name, retailer: purchase.retailer } : null,
      };
    });
  return {
    id: row.id,
    slug: row.slug,
    ownerId: row.owner_id,
    title: row.title,
    parentNames: row.parent_names ?? "",
    babyName: row.baby_name ?? "",
    familyNote: row.family_note ?? "",
    hasAddress: Array.isArray(row.registry_addresses) ? row.registry_addresses.length > 0 : Boolean(row.registry_addresses),
    profile: coerceProfile(row.profile),
    preferredRetailers: row.preferred_retailers,
    dueDate: row.due_date,
    revision: Number(row.revision),
    items,
  };
}

const supabaseStore = {
  async create(input: CreateRegistryInput) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await getSupabaseAdmin()
        .rpc("registry_create", {
          p_owner_id: input.ownerId,
          p_slug: makeSlug(input.title),
          p_title: input.title,
          p_parent_names: input.profile.parentNames ?? "",
          p_baby_name: input.profile.babyName ?? "",
          p_profile: input.profile,
          p_preferred_retailers: input.profile.preferredRetailers,
          p_due_date: input.profile.dueDate,
          p_items: input.items,
        })
        .single();
      if (!error && data) return (data as { id: string }).id;
      if (error?.code !== "23505") throw new RegistryError(friendlyError(error?.message));
    }
    throw new RegistryError("A unique link could not be created. Please try again.");
  },

  async getById(id: string) {
    const { data, error } = await getSupabaseAdmin().from("registries").select(REGISTRY_SELECT).eq("id", id).maybeSingle();
    if (error) throw new RegistryError(friendlyError(error.message));
    return data ? toRegistry(data as unknown as RegistryRow) : null;
  },

  async getBySlug(slug: string) {
    const { data, error } = await getSupabaseAdmin().from("registries").select(REGISTRY_SELECT).eq("slug", slug).maybeSingle();
    if (error) throw new RegistryError(friendlyError(error.message));
    return data ? toRegistry(data as unknown as RegistryRow) : null;
  },

  async listForOwner(ownerId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from("registries")
      .select("id, slug, title, created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) throw new RegistryError(friendlyError(error.message));
    return (data ?? []) as Array<{ id: string; slug: string; title: string }>;
  },

  async rpc(name: string, args: Record<string, unknown>) {
    const { error } = await getSupabaseAdmin().rpc(name, args);
    if (error) throw new RegistryError(friendlyError(error.message));
  },

  async setItemStatus(registryId: string, ownerId: string, itemId: string, status: ItemStatus) {
    await this.rpc("registry_set_item_status", {
      p_registry_id: registryId,
      p_owner_id: ownerId,
      p_item_id: itemId,
      p_status: status,
    });
  },

  async setItemQty(registryId: string, ownerId: string, itemId: string, qty: number) {
    await this.rpc("registry_set_item_qty", {
      p_registry_id: registryId,
      p_owner_id: ownerId,
      p_item_id: itemId,
      p_qty: qty,
    });
  },

  async setPrimaryOffer(registryId: string, ownerId: string, itemId: string, offerId: string) {
    await this.rpc("registry_set_primary_offer", {
      p_registry_id: registryId,
      p_owner_id: ownerId,
      p_item_id: itemId,
      p_offer_id: offerId,
    });
  },

  async applyEdits(registryId: string, ownerId: string, remove: string[], add: NewItem[], swaps: OfferSwap[]) {
    await this.rpc("registry_apply_edits", {
      p_registry_id: registryId,
      p_owner_id: ownerId,
      p_remove: remove,
      p_add: add,
      p_replace_offers: swaps,
    });
  },

  async markPurchased(slug: string, itemId: string, buyerName: string | null, retailer: RetailerId | null) {
    await this.rpc("registry_mark_purchased", {
      p_slug: slug,
      p_item_id: itemId,
      p_buyer_name: buyerName,
      p_retailer: retailer,
    });
  },

  async updateDetails(registryId: string, ownerId: string, details: RegistryDetails) {
    await this.rpc("registry_update_details", {
      p_registry_id: registryId,
      p_owner_id: ownerId,
      p_title: details.title,
      p_parent_names: details.parentNames,
      p_baby_name: details.babyName,
      p_family_note: details.familyNote,
    });
  },

  /** Callers must check ownership first. */
  async getAddress(registryId: string): Promise<ShippingAddress | null> {
    const { data, error } = await getSupabaseAdmin()
      .from("registry_addresses")
      .select("address")
      .eq("registry_id", registryId)
      .maybeSingle();
    if (error) throw new RegistryError(friendlyError(error.message));
    return (data?.address as ShippingAddress | undefined) ?? null;
  },

  async setAddress(registryId: string, ownerId: string, address: ShippingAddress | null) {
    await this.rpc("registry_set_address", { p_registry_id: registryId, p_owner_id: ownerId, p_address: address });
  },

  /** Callers must check ownership first. */
  async listAddressRequests(registryId: string): Promise<AddressRequest[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("address_requests")
      .select("id, requester_name, contact, message, status, created_at")
      .eq("registry_id", registryId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new RegistryError(friendlyError(error.message));
    return ((data ?? []) as AddressRequestRow[]).map(toAddressRequest);
  },

  async createAddressRequest(slug: string, input: AddressRequestInput, tokenHash: string): Promise<string> {
    const { data, error } = await getSupabaseAdmin().rpc("address_request_create", {
      p_slug: slug,
      p_name: input.name,
      p_contact: input.contact,
      p_message: input.message,
      p_token_hash: tokenHash,
    });
    if (error) throw new RegistryError(friendlyError(error.message));
    return data as string;
  },

  async decideAddressRequest(registryId: string, ownerId: string, requestId: string, status: "approved" | "declined") {
    await this.rpc("address_request_decide", {
      p_registry_id: registryId,
      p_owner_id: ownerId,
      p_request_id: requestId,
      p_status: status,
    });
  },

  /** What a requester may see: their request's status, plus the address once approved. */
  async getRequestForRequester(slug: string, requestId: string, tokenHash: string) {
    if (!UUID.test(requestId)) return null;
    const { data, error } = await getSupabaseAdmin()
      .from("address_requests")
      .select("status, registry_id, registries!inner(slug)")
      .eq("id", requestId)
      .eq("token_hash", tokenHash)
      .eq("registries.slug", slug)
      .maybeSingle();
    if (error) throw new RegistryError(friendlyError(error.message));
    if (!data) return null;
    const status = data.status as AddressRequestStatus;
    const address = status === "approved" ? await this.getAddress(data.registry_id as string) : null;
    return { status, address };
  },

  /** Replaces every item nobody has bought; title, names, note, address, and purchases stay. */
  async rebuild(registryId: string, ownerId: string, profile: ParentProfile, items: NewItem[]) {
    await this.rpc("registry_rebuild", {
      p_registry_id: registryId,
      p_owner_id: ownerId,
      ...profileColumns(profile),
      p_items: items,
    });
  },

  async updateProfile(registryId: string, ownerId: string, profile: ParentProfile) {
    await this.rpc("registry_update_profile", { p_registry_id: registryId, p_owner_id: ownerId, ...profileColumns(profile) });
  },

  async deleteRegistry(registryId: string, ownerId: string) {
    await this.rpc("registry_delete", { p_registry_id: registryId, p_owner_id: ownerId });
  },

  async listDrafts(ownerId: string): Promise<IntakeDraft[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("intake_drafts")
      .select(DRAFT_SELECT)
      .eq("owner_id", ownerId)
      .order("updated_at", { ascending: false });
    if (error) throw new RegistryError(friendlyError(error.message));
    return ((data ?? []) as DraftRow[]).map(toDraft);
  },

  async getDraft(draftId: string, ownerId: string): Promise<IntakeDraft | null> {
    if (!UUID.test(draftId)) return null;
    const { data, error } = await getSupabaseAdmin()
      .from("intake_drafts")
      .select(DRAFT_SELECT)
      .eq("id", draftId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (error) throw new RegistryError(friendlyError(error.message));
    return data ? toDraft(data as DraftRow) : null;
  },

  /** Callers must check that registryId belongs to ownerId. Resumes the existing draft for that target if there is one. */
  async openDraft(ownerId: string, registryId: string | null, options: OpenDraftOptions = {}): Promise<IntakeDraft> {
    const db = getSupabaseAdmin();
    const find = () => {
      const query = db.from("intake_drafts").select(DRAFT_SELECT).eq("owner_id", ownerId);
      return (registryId ? query.eq("registry_id", registryId) : query.is("registry_id", null)).maybeSingle();
    };
    const reset = options.fresh || options.seed !== undefined;
    const blank = { messages: [], chips: [], profile: null, seed: options.seed ?? null, updated_at: new Date().toISOString() };

    const existing = await find();
    if (existing.error) throw new RegistryError(friendlyError(existing.error.message));
    if (existing.data && !reset) return toDraft(existing.data as DraftRow);
    if (existing.data) {
      const { data, error } = await db.from("intake_drafts").update(blank).eq("id", existing.data.id).select(DRAFT_SELECT).single();
      if (error) throw new RegistryError(friendlyError(error.message));
      return toDraft(data as DraftRow);
    }

    const { data, error } = await db
      .from("intake_drafts")
      .insert({ owner_id: ownerId, registry_id: registryId, ...blank })
      .select(DRAFT_SELECT)
      .single();
    if (!error) return toDraft(data as DraftRow);
    // Two tabs opening at once: the other insert won, so use its draft.
    if (error.code === "23505") {
      const again = await find();
      if (again.data) return toDraft(again.data as DraftRow);
    }
    throw new RegistryError(friendlyError(error.message));
  },

  async saveDraft(draftId: string, ownerId: string, content: DraftContent) {
    const { data, error } = await getSupabaseAdmin()
      .from("intake_drafts")
      .update({ ...content, updated_at: new Date().toISOString() })
      .eq("id", draftId)
      .eq("owner_id", ownerId)
      .select("id");
    if (error) throw new RegistryError(friendlyError(error.message));
    if (!data?.length) throw new RegistryError("Those answers were already used or cleared.");
  },

  async deleteDraft(draftId: string, ownerId: string) {
    if (!UUID.test(draftId)) return;
    const { error } = await getSupabaseAdmin().from("intake_drafts").delete().eq("id", draftId).eq("owner_id", ownerId);
    if (error) throw new RegistryError(friendlyError(error.message));
  },
};

// ---------------------------------------------------------------------------
// Local JSON-file implementation, used only when Supabase is not configured so
// the app can be tried end to end without any accounts.

const LOCAL_FILE = path.join(process.cwd(), ".data", "registries.json");

async function readLocal(): Promise<Registry[]> {
  let registries: Registry[];
  try {
    registries = JSON.parse(await fs.readFile(LOCAL_FILE, "utf8")) as Registry[];
  } catch {
    return [];
  }
  const { addresses } = await readPrivate();
  // Registries saved before names and addresses existed lack these fields.
  return registries.map((r) => ({
    ...r,
    parentNames: r.parentNames ?? "",
    babyName: r.babyName ?? "",
    familyNote: r.familyNote ?? "",
    hasAddress: Boolean(addresses[r.id]),
    profile: coerceProfile(r.profile),
  }));
}

// Addresses and requests live apart from registries, mirroring the private Supabase tables.
const PRIVATE_FILE = path.join(process.cwd(), ".data", "private.json");
type LocalRequest = AddressRequest & { registryId: string; tokenHash: string };
type PrivateData = { addresses: Record<string, ShippingAddress>; requests: LocalRequest[] };

async function readPrivate(): Promise<PrivateData> {
  try {
    return JSON.parse(await fs.readFile(PRIVATE_FILE, "utf8")) as PrivateData;
  } catch {
    return { addresses: {}, requests: [] };
  }
}

async function writePrivate(data: PrivateData) {
  await fs.mkdir(path.dirname(PRIVATE_FILE), { recursive: true });
  await fs.writeFile(PRIVATE_FILE, JSON.stringify(data, null, 2));
}

async function requireOwnedLocal(registryId: string, ownerId: string) {
  const registry = (await readLocal()).find((r) => r.id === registryId && r.ownerId === ownerId);
  if (!registry) throw new RegistryError("Registry not found.");
  return registry;
}

const DRAFTS_FILE = path.join(process.cwd(), ".data", "drafts.json");
type LocalDraft = IntakeDraft & { ownerId: string };

async function readDrafts(): Promise<LocalDraft[]> {
  try {
    const drafts = JSON.parse(await fs.readFile(DRAFTS_FILE, "utf8")) as LocalDraft[];
    return drafts.map((d) => ({ ...d, profile: d.profile ? coerceProfile(d.profile) : null, seed: parseSeed(d.seed) }));
  } catch {
    return [];
  }
}

async function writeDrafts(drafts: LocalDraft[]) {
  await fs.mkdir(path.dirname(DRAFTS_FILE), { recursive: true });
  await fs.writeFile(DRAFTS_FILE, JSON.stringify(drafts, null, 2));
}

function publicDraft({ ownerId: _o, ...draft }: LocalDraft): IntakeDraft {
  return draft;
}

function publicRequest({ registryId: _r, tokenHash: _t, ...request }: LocalRequest): AddressRequest {
  return request;
}

async function writeLocal(registries: Registry[]) {
  await fs.mkdir(path.dirname(LOCAL_FILE), { recursive: true });
  await fs.writeFile(LOCAL_FILE, JSON.stringify(registries, null, 2));
}

function toLocalItem(item: NewItem, position: number): RegistryItem {
  return {
    id: crypto.randomUUID(),
    name: item.name,
    category: item.category,
    priority: item.priority,
    reason: item.reason,
    qty: item.qty,
    status: "pending",
    position,
    searchQuery: item.searchQuery,
    offers: item.offers.map((o, i) => ({ ...o, id: crypto.randomUUID(), isPrimary: i === 0 })),
    purchased: null,
  };
}

async function mutateLocal(registryId: string, ownerId: string, fn: (r: Registry) => void) {
  const all = await readLocal();
  const registry = all.find((r) => r.id === registryId && r.ownerId === ownerId);
  if (!registry) throw new RegistryError("Registry not found.");
  fn(registry);
  registry.revision += 1;
  await writeLocal(all);
}

function findItem(registry: Registry, itemId: string) {
  const item = registry.items.find((i) => i.id === itemId);
  if (!item) throw new RegistryError("That item is not on this registry.");
  return item;
}

const localStore: typeof supabaseStore = {
  async create(input) {
    const all = await readLocal();
    const registry: Registry = {
      id: crypto.randomUUID(),
      slug: makeSlug(input.title),
      ownerId: input.ownerId,
      title: input.title,
      parentNames: input.profile.parentNames ?? "",
      babyName: input.profile.babyName ?? "",
      familyNote: "",
      hasAddress: false,
      profile: input.profile,
      preferredRetailers: input.profile.preferredRetailers,
      dueDate: input.profile.dueDate,
      revision: 0,
      items: input.items.map(toLocalItem),
    };
    all.push(registry);
    await writeLocal(all);
    return registry.id;
  },
  async getById(id) {
    return (await readLocal()).find((r) => r.id === id) ?? null;
  },
  async getBySlug(slug) {
    return (await readLocal()).find((r) => r.slug === slug) ?? null;
  },
  async listForOwner(ownerId) {
    return (await readLocal())
      .filter((r) => r.ownerId === ownerId)
      .reverse()
      .map(({ id, slug, title }) => ({ id, slug, title }));
  },
  async rpc() {},
  async setItemStatus(registryId, ownerId, itemId, status) {
    await mutateLocal(registryId, ownerId, (r) => {
      findItem(r, itemId).status = status;
    });
  },
  async setItemQty(registryId, ownerId, itemId, qty) {
    await mutateLocal(registryId, ownerId, (r) => {
      findItem(r, itemId).qty = qty;
    });
  },
  async setPrimaryOffer(registryId, ownerId, itemId, offerId) {
    await mutateLocal(registryId, ownerId, (r) => {
      const item = findItem(r, itemId);
      if (!item.offers.some((o) => o.id === offerId)) throw new RegistryError("That item is not on this registry.");
      item.offers.forEach((o) => (o.isPrimary = o.id === offerId));
      item.offers.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    });
  },
  async applyEdits(registryId, ownerId, remove, add, swaps) {
    await mutateLocal(registryId, ownerId, (r) => {
      r.items = r.items.filter((i) => !remove.includes(i.id) || i.purchased);
      for (const swap of swaps) {
        const item = r.items.find((i) => i.id === swap.itemId);
        if (!item) continue;
        item.searchQuery = swap.searchQuery;
        item.reason = swap.reason;
        item.status = "pending";
        item.offers = swap.offers.map((o, i) => ({ ...o, id: crypto.randomUUID(), isPrimary: i === 0 }));
      }
      const start = r.items.reduce((max, i) => Math.max(max, i.position), -1) + 1;
      r.items.push(...add.map((item, i) => toLocalItem(item, start + i)));
    });
  },
  async markPurchased(slug, itemId, buyerName, retailer) {
    const all = await readLocal();
    const registry = all.find((r) => r.slug === slug);
    if (!registry) throw new RegistryError("Registry not found.");
    const item = findItem(registry, itemId);
    if (item.status === "skip") throw new RegistryError("That item is not on this registry.");
    if (item.purchased) throw new RegistryError("Someone already bought this one.");
    item.purchased = { buyerName: buyerName?.trim() || null, retailer };
    registry.revision += 1;
    await writeLocal(all);
  },
  async updateDetails(registryId, ownerId, details) {
    await mutateLocal(registryId, ownerId, (r) => Object.assign(r, details));
  },
  async getAddress(registryId) {
    return (await readPrivate()).addresses[registryId] ?? null;
  },
  async setAddress(registryId, ownerId, address) {
    await requireOwnedLocal(registryId, ownerId);
    const data = await readPrivate();
    if (address) data.addresses[registryId] = address;
    else delete data.addresses[registryId];
    await writePrivate(data);
    await mutateLocal(registryId, ownerId, () => undefined);
  },
  async listAddressRequests(registryId) {
    return (await readPrivate()).requests
      .filter((q) => q.registryId === registryId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(publicRequest);
  },
  async createAddressRequest(slug, input, tokenHash) {
    const registry = (await readLocal()).find((r) => r.slug === slug);
    if (!registry) throw new RegistryError("Registry not found.");
    const data = await readPrivate();
    if (!data.addresses[registry.id]) throw new RegistryError(friendlyError("NO_ADDRESS"));
    if (data.requests.filter((q) => q.registryId === registry.id && q.status === "pending").length >= 50) {
      throw new RegistryError(friendlyError("TOO_MANY_REQUESTS"));
    }
    const request: LocalRequest = {
      id: crypto.randomUUID(),
      registryId: registry.id,
      tokenHash,
      ...input,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    data.requests.push(request);
    await writePrivate(data);
    return request.id;
  },
  async decideAddressRequest(registryId, ownerId, requestId, status) {
    await requireOwnedLocal(registryId, ownerId);
    const data = await readPrivate();
    const request = data.requests.find((q) => q.id === requestId && q.registryId === registryId);
    if (!request) throw new RegistryError(friendlyError("REQUEST_NOT_FOUND"));
    request.status = status;
    await writePrivate(data);
  },
  async getRequestForRequester(slug, requestId, tokenHash) {
    const registry = (await readLocal()).find((r) => r.slug === slug);
    const data = await readPrivate();
    const request = data.requests.find((q) => q.id === requestId && q.tokenHash === tokenHash && q.registryId === registry?.id);
    if (!request) return null;
    return { status: request.status, address: request.status === "approved" ? (data.addresses[request.registryId] ?? null) : null };
  },
  async rebuild(registryId, ownerId, profile, items) {
    await mutateLocal(registryId, ownerId, (r) => {
      r.items = r.items.filter((i) => i.purchased);
      Object.assign(r, { profile, preferredRetailers: profile.preferredRetailers, dueDate: profile.dueDate });
      const start = r.items.reduce((max, i) => Math.max(max, i.position), -1) + 1;
      r.items.push(...items.map((item, i) => toLocalItem(item, start + i)));
    });
  },
  async updateProfile(registryId, ownerId, profile) {
    await mutateLocal(registryId, ownerId, (r) =>
      Object.assign(r, { profile, preferredRetailers: profile.preferredRetailers, dueDate: profile.dueDate }),
    );
  },
  async deleteRegistry(registryId, ownerId) {
    await requireOwnedLocal(registryId, ownerId);
    await writeLocal((await readLocal()).filter((r) => r.id !== registryId));
    const data = await readPrivate();
    delete data.addresses[registryId];
    data.requests = data.requests.filter((q) => q.registryId !== registryId);
    await writePrivate(data);
    await writeDrafts((await readDrafts()).filter((d) => d.registryId !== registryId));
  },
  async listDrafts(ownerId) {
    return (await readDrafts())
      .filter((d) => d.ownerId === ownerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(publicDraft);
  },
  async getDraft(draftId, ownerId) {
    const draft = (await readDrafts()).find((d) => d.id === draftId && d.ownerId === ownerId);
    return draft ? publicDraft(draft) : null;
  },
  async openDraft(ownerId, registryId, options = {}) {
    const drafts = await readDrafts();
    const existing = drafts.find((d) => d.ownerId === ownerId && d.registryId === registryId);
    const reset = options.fresh || options.seed !== undefined;
    if (existing && !reset) return publicDraft(existing);
    const blank = { messages: [], chips: [], profile: null, seed: options.seed ?? null, updatedAt: new Date().toISOString() };
    const draft: LocalDraft = existing ? Object.assign(existing, blank) : { id: crypto.randomUUID(), ownerId, registryId, ...blank };
    if (!existing) drafts.push(draft);
    await writeDrafts(drafts);
    return publicDraft(draft);
  },
  async saveDraft(draftId, ownerId, content) {
    const drafts = await readDrafts();
    const draft = drafts.find((d) => d.id === draftId && d.ownerId === ownerId);
    if (!draft) throw new RegistryError("Those answers were already used or cleared.");
    Object.assign(draft, content, { updatedAt: new Date().toISOString() });
    await writeDrafts(drafts);
  },
  async deleteDraft(draftId, ownerId) {
    await writeDrafts((await readDrafts()).filter((d) => !(d.id === draftId && d.ownerId === ownerId)));
  },
};

export function registryStore() {
  return isSupabaseConfigured() ? supabaseStore : localStore;
}
