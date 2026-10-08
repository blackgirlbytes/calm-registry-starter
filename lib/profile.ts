import { z } from "zod";
import { ParentProfileSchema, SEED_FIELDS, type ParentProfile, type ProfileSeed } from "./types";

export const PROFILE_DEFAULTS: ParentProfile = {
  parentNames: "",
  babyName: "",
  dueDate: null,
  babySex: "unknown",
  babies: 1,
  city: "",
  home: "unknown",
  hasCar: null,
  household: [],
  feeding: "unsure",
  work: "unsure",
  travel: null,
  hairType: "unknown",
  sensitiveSkin: null,
  languages: [],
  circle: "medium",
  budget: "moderate",
  values: [],
  alreadyHave: [],
  preferredRetailers: [],
  notes: "",
};

// Before values were limited to these two, they were free text like "Eco-friendly" or "Minimal".
const LEGACY_VALUES: Record<string, ParentProfile["values"][number]> = {
  eco: "organic",
  "eco-friendly": "organic",
  organic: "organic",
  minimal: "simple",
  simple: "simple",
};

function upgradeLegacy(raw: Record<string, unknown>) {
  if (!Array.isArray(raw.values)) return raw;
  const values = raw.values.filter((v): v is string => typeof v === "string");
  const known = [...new Set(values.map((v) => LEGACY_VALUES[v.toLowerCase()]).filter(Boolean))];
  // Gender-neutral was the default all along, so it says nothing new; anything else is kept as a note.
  const other = values.filter((v) => !LEGACY_VALUES[v.toLowerCase()] && !/gender.?neutral|no preference/i.test(v));
  const notes = typeof raw.notes === "string" ? raw.notes : "";
  return { ...raw, values: known, notes: other.length ? [notes, ...other].filter(Boolean).join(". ") : notes };
}

/** Keeps each field that's valid; arrays keep their valid entries. */
function validFields<K extends keyof ParentProfile>(raw: Record<string, unknown>, keys: readonly K[]) {
  const out: Partial<Pick<ParentProfile, K>> = {};
  for (const key of keys) {
    if (!(key in raw)) continue;
    const field = ParentProfileSchema.shape[key];
    const value = raw[key];
    if (field instanceof z.ZodArray && Array.isArray(value)) {
      out[key] = value.filter((entry) => field.element.safeParse(entry).success) as ParentProfile[K];
      continue;
    }
    const parsed = field.safeParse(value);
    if (parsed.success) out[key] = parsed.data as ParentProfile[K];
  }
  return out;
}

const PROFILE_KEYS = Object.keys(ParentProfileSchema.shape) as (keyof ParentProfile)[];

/** Fills anything missing or malformed with a default, so older registries and drafts always load. */
export function coerceProfile(value: unknown): ParentProfile {
  const raw = value && typeof value === "object" ? upgradeLegacy(value as Record<string, unknown>) : {};
  return normalizeProfile({ ...PROFILE_DEFAULTS, ...validFields(raw, PROFILE_KEYS) });
}

/** Carried-over answers; anything malformed is dropped rather than trusted. */
export function parseSeed(value: unknown): ProfileSeed | null {
  if (!value || typeof value !== "object") return null;
  const seed: ProfileSeed = validFields(upgradeLegacy(value as Record<string, unknown>), SEED_FIELDS);
  return Object.keys(seed).length ? seed : null;
}

/** Guards against a model picking a month that already passed this year. */
export function futureDueDate(dueDate: string | null) {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const date = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  while (date.getTime() < today.getTime() - 24 * 3600 * 1000) date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

/** Models sometimes write "[Last Name]" or "N/A" when they don't know a name. */
function cleanName(value: string | undefined) {
  const name = (value ?? "").trim().replace(/\s+/g, " ");
  if (!name || /[[\]{}<>]|^(n\/?a|none|unknown|not sure|skip|tbd|undecided|not decided( yet)?)$/i.test(name)) return "";
  return name.slice(0, 80);
}

function cleanList(values: string[], max: number) {
  const seen = new Set<string>();
  return values
    .map((v) => v.trim().slice(0, 40))
    .filter((v) => v && !/^(english|none|n\/?a)$/i.test(v) && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()))
    .slice(0, max);
}

export function normalizeProfile(profile: ParentProfile): ParentProfile {
  const babies = Math.min(3, Math.max(1, Math.round(profile.babies) || 1));
  return {
    ...profile,
    parentNames: cleanName(profile.parentNames),
    babyName: cleanName(profile.babyName).slice(0, 40),
    dueDate: futureDueDate(profile.dueDate),
    babies,
    // A boy and a girl only makes sense with more than one baby.
    babySex: profile.babySex === "mixed" && babies === 1 ? "unknown" : profile.babySex,
    city: /^(skip|none|n\/?a|not sure)/i.test(profile.city.trim()) ? "" : profile.city.trim().slice(0, 80),
    household: [...new Set(profile.household)],
    languages: cleanList(profile.languages, 4),
    values: [...new Set(profile.values)],
  };
}

/** Built from what the parent told us, so it never contains placeholders. Parents can rename it. */
export function registryTitle(profile: Pick<ParentProfile, "parentNames" | "babyName">) {
  const baby = cleanName(profile.babyName);
  const parents = cleanName(profile.parentNames);
  if (baby) return `${baby}'s registry`;
  if (parents) return `${parents}'s baby registry`;
  return "Our baby registry";
}
