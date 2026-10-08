import { z } from "zod";

export const RETAILERS = ["amazon", "walmart", "target"] as const;
export type RetailerId = (typeof RETAILERS)[number];

export const RETAILER_LABELS: Record<RetailerId, string> = {
  amazon: "Amazon",
  walmart: "Walmart",
  target: "Target",
};

export const CATEGORIES = [
  "Sleep",
  "Feeding",
  "Diapering",
  "Bath",
  "On-the-go",
  "Clothing",
  "Health",
  "Play",
  "For the parents",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ["must-have", "nice-to-have", "later"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type ItemStatus = "pending" | "keep" | "skip";

/** The reason saved on an item when the parent swapped in a product they already had in mind. */
export const PICK_REASON = "The one you had in mind.";

export const HOUSEHOLD = ["siblings", "pets", "grandparents"] as const;
export const CIRCLES = ["small", "medium", "big"] as const;
export const VALUES = ["organic", "simple"] as const;

export const ParentProfileSchema = z.object({
  parentNames: z.string().describe("Parents' first names as they'd like them shown, e.g. 'Maya and Jordan'. Empty if not shared."),
  babyName: z.string().describe("Baby's name or nickname if picked. Empty if not decided or not shared."),
  dueDate: z.string().nullable(),
  babySex: z
    .enum(["boy", "girl", "mixed", "surprise", "unknown"])
    .describe("Only what they said. 'mixed' is twins with a boy and a girl. Never guess from names or anything else."),
  babies: z.number().describe("How many babies: 1, or 2 for twins, 3 for triplets."),
  city: z.string().describe("The city they live in, e.g. 'Houston, TX'. Empty if not shared. Never a street address."),
  home: z.enum(["apartment", "house", "unknown"]),
  hasCar: z.boolean().nullable(),
  household: z.array(z.enum(HOUSEHOLD)).describe("Who else lives with them: big kids, pets, or grandparents who help or live there."),
  feeding: z.enum(["breast", "formula", "both", "unsure"]),
  work: z.enum(["back-to-work", "home", "unsure"]).describe("Whether they're going back to work (often with daycare) or home with baby."),
  travel: z.boolean().nullable().describe("Whether they'll travel with baby, like flying to see family."),
  hairType: z.enum(["straight", "wavy", "curly", "coily", "unknown"]).describe("The hair type that runs in their family. Only what they said."),
  sensitiveSkin: z.boolean().nullable().describe("Whether sensitive skin or eczema runs in the family."),
  languages: z.array(z.string()).describe("Languages spoken at home other than English, e.g. ['Spanish']. Empty if none."),
  circle: z.enum(CIRCLES).describe("How many people will shop the registry: a small circle, in between, or a big family crowd."),
  budget: z
    .enum(["lean", "moderate", "generous"])
    .describe("Gift prices. Not asked; use 'moderate' (a mix of prices) unless they bring it up."),
  values: z.array(z.enum(VALUES)).describe("'organic' to lean organic, 'simple' to keep the list to essentials."),
  alreadyHave: z.array(z.string()),
  preferredRetailers: z.array(z.enum(RETAILERS)),
  notes: z.string(),
});
export type ParentProfile = z.infer<typeof ParentProfileSchema>;

export const GeneratedItemSchema = z.object({
  name: z.string(),
  category: z.enum(CATEGORIES),
  priority: z.enum(PRIORITIES),
  reason: z.string(),
  // No max here: models sometimes over-count, and offers.ts clamps instead of rejecting the registry.
  qty: z.number().describe("Units to register for, 1-20. Count packs or sets, e.g. 4 packs of diapers, not 200 diapers."),
  searchQuery: z.string(),
});
export type GeneratedItem = z.infer<typeof GeneratedItemSchema>;

export type Offer = {
  retailer: RetailerId;
  externalId: string;
  title: string;
  price: number | null;
  imageUrl: string | null;
  url: string;
  rating: number | null;
  inStock: boolean;
};

export type RegistryItem = {
  id: string;
  name: string;
  category: Category;
  priority: Priority;
  reason: string;
  qty: number;
  status: ItemStatus;
  position: number;
  searchQuery: string;
  offers: Array<Offer & { id: string; isPrimary: boolean }>;
  purchased: { buyerName: string | null; retailer: RetailerId | null } | null;
};

export type Registry = {
  id: string;
  slug: string;
  ownerId: string;
  title: string;
  parentNames: string;
  babyName: string;
  familyNote: string;
  /** Whether a private shipping address is on file. The address itself is never part of Registry. */
  hasAddress: boolean;
  profile: ParentProfile;
  preferredRetailers: RetailerId[];
  dueDate: string | null;
  revision: number;
  items: RegistryItem[];
};

export const DetailsSchema = z.object({
  title: z.string().trim().min(1).max(80),
  parentNames: z.string().trim().max(80),
  babyName: z.string().trim().max(40),
  familyNote: z.string().trim().max(500),
});
export type RegistryDetails = z.infer<typeof DetailsSchema>;

export const AddressSchema = z.object({
  recipient: z.string().trim().min(1).max(80),
  line1: z.string().trim().min(1).max(120),
  line2: z.string().trim().max(120),
  city: z.string().trim().min(1).max(80),
  region: z.string().trim().max(80),
  postalCode: z.string().trim().max(20),
  country: z.string().trim().max(60),
});
export type ShippingAddress = z.infer<typeof AddressSchema>;

export const AddressRequestInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  contact: z.string().trim().min(3).max(120),
  message: z.string().trim().max(300),
});

export type AddressRequestStatus = "pending" | "approved" | "declined";
export type AddressRequest = {
  id: string;
  name: string;
  contact: string;
  message: string;
  status: AddressRequestStatus;
  createdAt: string;
};

export type ChatMessage = { role: "assistant" | "user"; content: string };

/** Answers that usually stay the same from one baby to the next. */
export const SEED_FIELDS = [
  "city",
  "home",
  "hasCar",
  "household",
  "feeding",
  "work",
  "travel",
  "hairType",
  "sensitiveSkin",
  "languages",
  "circle",
  "budget",
  "values",
  "preferredRetailers",
] as const;
export type ProfileSeed = Partial<Pick<ParentProfile, (typeof SEED_FIELDS)[number]>>;

export type IntakeDraft = {
  id: string;
  /** null while answering for a new registry; otherwise answering again will rebuild this registry. */
  registryId: string | null;
  messages: ChatMessage[];
  chips: string[];
  /** Set once the chat is finished and the parent is checking their answers. */
  profile: ParentProfile | null;
  seed: ProfileSeed | null;
  updatedAt: string;
};

export const DraftSaveSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["assistant", "user"]), content: z.string().max(2000) }))
    .max(80),
  chips: z.array(z.string().max(80)).max(8),
  profile: ParentProfileSchema.nullable(),
});

export const EditDiffSchema = z.object({
  summary: z.string(),
  remove: z.array(z.string()).describe("ids of items to remove"),
  add: z.array(GeneratedItemSchema),
  swap: z
    .array(z.object({ id: z.string(), searchQuery: z.string(), reason: z.string() }))
    .describe("items to re-search with a new query"),
});
export type EditDiff = z.infer<typeof EditDiffSchema>;
