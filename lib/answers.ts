import { RETAILER_LABELS, SEED_FIELDS, type ParentProfile, type ProfileSeed } from "./types";

/** Plain-word versions of each answer, shared by the answers card, change previews, and prompts. */

export const HOME_LABELS: Record<ParentProfile["home"], string> = {
  apartment: "Apartment",
  house: "House",
  unknown: "Not sure",
};

export const FEEDING_LABELS: Record<ParentProfile["feeding"], string> = {
  breast: "Breastfeeding",
  formula: "Formula",
  both: "A mix",
  unsure: "Not sure yet",
};

export const BUDGET_LABELS: Record<ParentProfile["budget"], string> = {
  lean: "Mostly smaller gifts (big items under $150)",
  moderate: "A mix of gift prices",
  generous: "Include big group gifts",
};

export const SEX_LABELS: Record<ParentProfile["babySex"], string> = {
  boy: "A boy",
  girl: "A girl",
  mixed: "A boy and a girl",
  surprise: "It's a surprise",
  unknown: "Not sure yet",
};

export const HOUSEHOLD_LABELS: Record<ParentProfile["household"][number], string> = {
  siblings: "Big kids",
  pets: "Pets",
  grandparents: "Grandparents",
};

export const WORK_LABELS: Record<ParentProfile["work"], string> = {
  "back-to-work": "Going back to work",
  home: "Home with baby",
  unsure: "Not sure yet",
};

export const HAIR_LABELS: Record<ParentProfile["hairType"], string> = {
  straight: "Straight",
  wavy: "Wavy",
  curly: "Curly",
  coily: "Coily",
  unknown: "Not sure",
};

export const CIRCLE_LABELS: Record<ParentProfile["circle"], string> = {
  small: "A small circle (about 20-25 gifts)",
  medium: "In between (about 25-35 gifts)",
  big: "A big crowd (about 35-45 gifts)",
};

export const VALUE_LABELS: Record<ParentProfile["values"][number], string> = {
  organic: "Lean organic",
  simple: "Keep it simple",
};

const MULTIPLES = ["", "", "Twins", "Triplets"];

export function babyLabel(profile: Pick<ParentProfile, "babySex" | "babies">) {
  if (profile.babies < 2) return SEX_LABELS[profile.babySex];
  const many = MULTIPLES[profile.babies] ?? "Twins";
  const detail = { boy: "boys", girl: "girls", mixed: "a boy and a girl", surprise: "a surprise", unknown: "" }[profile.babySex];
  return detail ? `${many}, ${detail}` : many;
}

function yesNo(value: boolean | null, yes: string, no: string) {
  return value === true ? yes : value === false ? no : "Not sure";
}

export function carLabel(hasCar: boolean | null) {
  return hasCar === true ? "Drives" : hasCar === false ? "Doesn't drive" : "Not sure";
}

export function dueLabel(dueDate: string | null) {
  if (!dueDate) return "Not sure yet";
  const date = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Not sure yet";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function list(values: string[], empty: string) {
  return values.length ? values.join(", ") : empty;
}

export function storesLabel(stores: ParentProfile["preferredRetailers"]) {
  return stores.length ? stores.map((s) => RETAILER_LABELS[s]).join(", ") : "Any store";
}

/** Fields shown on the answers card, in the order the chat asks about them. */
export function describeAnswers(profile: ParentProfile) {
  return {
    dueDate: dueLabel(profile.dueDate),
    names: [profile.parentNames, profile.babyName && `baby ${profile.babyName}`].filter(Boolean).join(", ") || "Not shared",
    baby: babyLabel(profile),
    city: profile.city || "Not shared",
    home: HOME_LABELS[profile.home],
    hasCar: carLabel(profile.hasCar),
    household: list(profile.household.map((h) => HOUSEHOLD_LABELS[h]), "Just us"),
    feeding: FEEDING_LABELS[profile.feeding],
    work: WORK_LABELS[profile.work],
    alreadyHave: list(profile.alreadyHave, "Nothing yet"),
    preferredRetailers: storesLabel(profile.preferredRetailers),
    travel: yesNo(profile.travel, "Traveling with baby", "Not much travel"),
    hairType: HAIR_LABELS[profile.hairType],
    sensitiveSkin: yesNo(profile.sensitiveSkin, "Runs in the family", "Not a concern"),
    languages: list(profile.languages, "Just English"),
    circle: CIRCLE_LABELS[profile.circle],
    values: list(profile.values.map((v) => VALUE_LABELS[v]), "No preference"),
    budget: BUDGET_LABELS[profile.budget],
    notes: profile.notes.trim() || "Nothing else",
  };
}

const CHANGE_LABELS: Array<[keyof ReturnType<typeof describeAnswers>, string]> = [
  ["dueDate", "due date"],
  ["baby", "baby"],
  ["city", "city"],
  ["home", "home"],
  ["hasCar", "driving"],
  ["household", "who's at home"],
  ["feeding", "feeding"],
  ["work", "work"],
  ["alreadyHave", "already have"],
  ["preferredRetailers", "stores"],
  ["travel", "travel"],
  ["hairType", "family hair type"],
  ["sensitiveSkin", "sensitive skin"],
  ["languages", "languages at home"],
  ["circle", "how many people will shop"],
  ["values", "organic or simple"],
  ["budget", "gift prices"],
  ["notes", "notes"],
];

/** e.g. ["home: Apartment → House"]. Names are left out because they don't change which items fit. */
export function describeChanges(before: ParentProfile, after: ParentProfile) {
  const a = describeAnswers(before);
  const b = describeAnswers(after);
  return CHANGE_LABELS.filter(([key]) => a[key] !== b[key]).map(([key, label]) => `${label}: ${a[key]} → ${b[key]}`);
}

export function seedFrom(profile: ParentProfile): ProfileSeed {
  return Object.fromEntries(SEED_FIELDS.map((key) => [key, profile[key]])) as ProfileSeed;
}

/** "Houston, apartment, doesn't drive, formula…" for the seeded opening line. */
export function describeSeed(seed: ProfileSeed) {
  const parts = [
    seed.city ?? "",
    seed.home && seed.home !== "unknown" ? HOME_LABELS[seed.home].toLowerCase() : "",
    seed.hasCar === undefined || seed.hasCar === null ? "" : carLabel(seed.hasCar).toLowerCase(),
    ...(seed.household ?? []).map((h) => HOUSEHOLD_LABELS[h].toLowerCase()),
    seed.feeding && seed.feeding !== "unsure" ? FEEDING_LABELS[seed.feeding].toLowerCase() : "",
    seed.preferredRetailers?.length ? storesLabel(seed.preferredRetailers) : "",
  ];
  return parts.filter(Boolean).join(", ");
}
