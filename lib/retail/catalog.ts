import "server-only";
import type { Offer, RetailerId } from "../types";
import entries from "./catalog.json";

type CatalogEntry = {
  kind: string;
  retailer: RetailerId;
  brand: string;
  title: string;
  price: number | null;
  imageUrl: string;
  url: string;
  tier: "budget" | "mid" | "premium";
  checkedAt: string;
};

const CATALOG = entries as CatalogEntry[];
const KINDS = [...new Set(CATALOG.map((e) => e.kind))];

// What a parent would call each catalog kind.
const KIND_NAMES: Record<string, string> = {
  bassinet: "Bassinet",
  "convertible crib": "Crib",
  "mini crib": "Mini crib",
  "firm crib mattress": "Crib mattress",
  "fitted bassinet sheets": "Bassinet sheets",
  "zip swaddle newborn": "Swaddles",
  "wearable blanket sleep sack": "Sleep sacks",
  "white noise machine baby": "White noise machine",
  "video baby monitor": "Baby monitor",
  "anti colic baby bottles": "Bottles",
  "bottle drying rack and brush": "Drying rack and brush",
  "electric breast pump": "Breast pump",
  "muslin burp cloths": "Burp cloths",
  "formula dispenser on the go": "Formula dispenser",
  "compact high chair": "High chair",
  "nursing pillow": "Nursing pillow",
  "contoured changing pad": "Changing pad",
  "diaper rash cream": "Diaper cream",
  "odor locking diaper pail": "Diaper pail",
  "newborn diapers": "Diapers",
  "sensitive baby wipes": "Wipes",
  "infant bathtub": "Baby bathtub",
  "tear free baby wash": "Baby wash",
  "hooded baby towel": "Hooded towels",
  "ergonomic baby carrier": "Baby carrier",
  "baby car mirror": "Car mirror",
  "backpack diaper bag": "Diaper bag",
  "infant car seat": "Infant car seat",
  "lightweight compact stroller": "Stroller",
  "newborn bodysuits": "Bodysuits",
  "zip footed sleeper newborn": "Zip sleepers",
  "newborn socks and mittens": "Socks and mittens",
  "baby thermometer": "Thermometer",
  "baby nail clippers": "Nail clippers",
  "baby nasal aspirator": "Nasal aspirator",
  "cool mist humidifier": "Humidifier",
  "baby play gym mat": "Play gym",
  "baby bouncer": "Bouncer",
  "baby board books set": "Board books",
};

/** Prompt text that steers the model's searchQuery toward products we have real photos and links for. */
export const CATALOG_QUERY_RULE = `- name and searchQuery: when the item is one of these, use this name and this exact searchQuery (searchQuery may start with "affordable" or "organic"):
${KINDS.map((k) => `  name "${KIND_NAMES[k] ?? k}", searchQuery "${k}"`).join("\n")}
  For anything else, use a short natural name and a concise generic searchQuery with no brand names.`;

// Words that describe who or how, not what, so they never decide a match.
const GENERIC = new Set(["baby", "newborn", "infant", "organic", "affordable", "cheap", "budget", "eco", "set", "and", "for", "the", "with"]);

function words(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((w) => w.replace(/(es|s)$/, ""))
    .filter((w) => w.length > 2 && !GENERIC.has(w));
}

/**
 * The catalog kind that names the same thing as the query, e.g. "organic zip swaddle" → "zip swaddle newborn".
 * The query's last word (its noun) must be in the kind, and most of the query must be covered,
 * so "crib sheets" doesn't match "convertible crib". No match is better than the wrong product.
 */
function matchKind(query: string) {
  const queryWords = words(query);
  const noun = queryWords.at(-1);
  if (!noun) return null;
  let best: { kind: string; score: number } | null = null;
  for (const kind of KINDS) {
    const kindWords = new Set(words(kind));
    if (!kindWords.has(noun)) continue;
    const coverage = queryWords.filter((w) => kindWords.has(w)).length / queryWords.length;
    const score = coverage + coverage / kindWords.size;
    if (coverage >= 0.66 && (!best || score > best.score)) best = { kind, score };
  }
  return best?.kind ?? null;
}

function toOffer(entry: CatalogEntry): Offer {
  return {
    retailer: entry.retailer,
    externalId: `catalog:${entry.url}`,
    title: entry.title,
    price: entry.price,
    imageUrl: entry.imageUrl,
    url: entry.url,
    rating: null,
    inStock: true,
  };
}

/** Real, hand-checked products for a query, or null when the catalog doesn't cover it. */
export function catalogSearch(query: string, maxPrice?: number): Offer[] | null {
  // Catalog clothing is neutral, so a boy or girl search goes to the store's own results instead.
  if (/\b(boys?|girls?)\b/i.test(query)) return null;
  const kind = matchKind(query);
  if (!kind) return null;
  const matches = CATALOG.filter((e) => e.kind === kind);
  const affordable = maxPrice ? matches.filter((e) => e.price === null || e.price <= maxPrice) : matches;
  const pool = affordable.length ? affordable : matches;
  const wantsBudget = /\b(affordable|cheap|budget)\b/i.test(query);
  return pool
    .toSorted((a, b) => Number(wantsBudget && b.tier === "budget") - Number(wantsBudget && a.tier === "budget"))
    .map(toOffer);
}

const FILLER = new Set(["one", "that", "this", "from", "brand", "kind", "model", "type"]);

/**
 * Catalog products that are the specific thing a parent named, like "HALO BassiNest".
 * Every word they said has to be in the brand or title, so naming a product never returns a different one.
 */
export function catalogPick(query: string): Offer[] {
  const wanted = words(query).filter((w) => !FILLER.has(w));
  if (!wanted.length) return [];
  return CATALOG.filter((e) => {
    const have = new Set(words(`${e.brand} ${e.title}`));
    return wanted.every((w) => have.has(w));
  }).map(toOffer);
}

/** The first catalog product of a kind, for showing a real example. */
export function catalogExample(kind: string) {
  const entry = CATALOG.find((e) => e.kind === kind && e.imageUrl);
  return entry ? toOffer(entry) : null;
}
