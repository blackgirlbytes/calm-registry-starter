import "server-only";
import { z } from "zod";
import { CATEGORIES, GeneratedItemSchema, type GeneratedItem, type ParentProfile } from "../types";
import { CATALOG_QUERY_RULE } from "../retail/catalog";
import { registryTitle } from "../profile";
import { callJson, isOpenAIConfigured } from "./openai";

const GeneratedRegistrySchema = z.object({
  items: z.array(GeneratedItemSchema),
});

const ITEM_RANGE: Record<ParentProfile["circle"], [number, number]> = { small: [20, 25], medium: [25, 35], big: [35, 45] };

function systemPrompt(profile: ParentProfile) {
  const [min, max] = ITEM_RANGE[profile.circle];
  return `You build baby registries for tired, overwhelmed expecting parents.
Given a parent profile, return ${min}-${max} items. Rules:
- name: what a parent would call it, short and in sentence case, e.g. "Swaddles", "White noise machine", "Car seat". Never copy searchQuery into name.
- category must be one of: ${CATEGORIES.join(", ")}.
- priority: "must-have" (needed in the first weeks), "nice-to-have", or "later" (3-12 months).
- reason: ONE short, reassuring sentence explaining why this item helps THEM specifically.
- qty: 1-20, counted in packs or sets (e.g. 4 packs of diapers, 8 bodysuits).
${CATALOG_QUERY_RULE}
- Respect their space (apartment = compact), car use, and feeding plan.
- Weather: ${weatherLine(profile)}
- babySex "boy" or "girl": clothing searchQuery starts with "baby boy" or "baby girl"; "mixed": one set of each.
  Otherwise keep clothing neutral. Only clothing changes with sex.
- babies 2 or 3: multiply clothing, diapers, wipes, bottles, and burp cloths; one bassinet and car seat per baby;
  a "double stroller" instead of a single one.
- household "siblings": a big-sibling gift such as a big sibling book. "pets": a baby gate.
  "grandparents": a travel crib for their place.
- work "back-to-work": bottle labels and extra bottles for daycare; if they breastfeed, also a breast pump bag,
  a breast milk cooler bag, and spare pump parts.
- travel true: a travel crib, a car seat travel bag, a lightweight travel stroller, and a portable sound machine.
- hairType "curly" or "coily": a baby wide-tooth comb, a gentle detangling brush, a satin crib sheet, and a baby
  leave-in moisturizer. Otherwise one soft baby brush.
- sensitiveSkin true: a fragrance-free eczema baby wash and a baby eczema balm.
- languages: bilingual board books for each, e.g. searchQuery "spanish english bilingual baby board books".
- values "organic": organic picks (searchQuery may start with "organic"). "simple": essentials only, few nice-to-haves.
- Always include board books with diverse families, and a soft baby doll ("pick one that looks like your family").
- Gift prices: friends and family buy these, at every budget. Include plenty of small gifts under $25, a solid
  middle, and a few big items people can go in on together. budget "lean": keep big items affordable;
  "generous": premium big items are welcome.
- "For the parents": 4-6 postpartum items for the birthing parent, such as a peri bottle, postpartum pads, a soft
  robe, and a big water bottle; if they breastfeed, also nipple balm and nursing bras.
- notes may say it's not their first baby; then focus on consumables and what wears out, and skip most gear.
- Always cover these basics unless they already have them: ${essentials()}.
- Leave out anything they already have. Avoid gimmicks; favor safety-first, proven essentials.
- Never include unsafe sleep items (bumpers, positioners, weighted sleep sacks, inclined sleepers).`;
}

function essentials() {
  return [...new Set(TEMPLATES.filter((t) => t.priority === "must-have" && !t.when && !t.keep).map((t) => t.name.toLowerCase()))].join(", ");
}

type Season = "cold" | "hot" | "mild";

/** Northern-hemisphere season for baby's first three months. */
export function seasonFor(dueDate: string | null): Season | null {
  if (!dueDate) return null;
  const month = new Date(`${dueDate}T00:00:00Z`).getUTCMonth();
  if (Number.isNaN(month)) return null;
  return [9, 10, 11, 0, 1].includes(month) ? "cold" : [4, 5, 6, 7].includes(month) ? "hot" : "mild";
}

function weatherLine(profile: ParentProfile) {
  if (!profile.dueDate) return "the due date isn't known, so keep clothing for all seasons.";
  const month = new Date(`${profile.dueDate}T00:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const where = profile.city ? `in ${profile.city}` : "(city not shared; assume a typical US climate)";
  return `baby arrives in ${month} ${where}. Plan clothing and gear for the weather there during baby's first three months:
  cold means fleece footie pajamas, a bunting, a stroller footmuff, and a humidifier; hot means muslin swaddles,
  a stroller fan, and light short-sleeve layers.`;
}

export async function generateRegistry(profile: ParentProfile): Promise<{ title: string; items: GeneratedItem[] }> {
  const title = registryTitle(profile);
  if (!isOpenAIConfigured()) return { title, items: mockItems(profile) };
  const required = requiredItems(profile);
  const { items } = await callJson("registry", GeneratedRegistrySchema, [
    { role: "system", content: `${systemPrompt(profile)}\n${requiredLine(required, profile)}` },
    { role: "user", content: JSON.stringify(profile) },
  ]);
  return { title, items: finishItems(items, required, profile) };
}

const brief = (i: GeneratedItem) => `  ${JSON.stringify({ name: i.name, category: i.category, priority: i.priority, qty: i.qty, searchQuery: i.searchQuery })}`;

function requiredLine(required: GeneratedItem[], profile: ParentProfile) {
  const weather = TEMPLATES.filter((t) => t.weather && applies(t, profile)).map((t) => toItem(t, profile));
  return [
    required.length
      ? `- Include every one of these, with exactly this name, category, and searchQuery, instead of a generic version:\n${required.map(brief).join("\n")}`
      : "",
    weather.length
      ? `- For the weather, include whichever of these fit their city in those months (skip them if it stays warm, or cool):\n${weather.map(brief).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Models skip rules on long lists, so the family's own picks, sex, and list size are enforced here. */
function finishItems(items: GeneratedItem[], required: GeneratedItem[], profile: ParentProfile): GeneratedItem[] {
  const named = new Set(items.map((i) => i.name.trim().toLowerCase()));
  const keep = new Set(required.map((i) => i.name.toLowerCase()));
  const all = [...items.map((i) => ({ ...i, searchQuery: withSex(i, profile) })), ...required.filter((r) => !named.has(r.name.toLowerCase()))];
  return fitToCircle(
    all.map((i) => ({ ...i, personal: keep.has(i.name.trim().toLowerCase()) })),
    ITEM_RANGE[profile.circle][1],
  );
}

type Template = GeneratedItem & {
  when?: (p: ParentProfile) => boolean;
  skipIfHave?: string;
  perBaby?: boolean;
  /** Picked for this family: the AI must include it, and trimming never drops it. */
  keep?: boolean;
  /** Depends on local weather, which the AI judges from the city, so it's suggested rather than required. */
  weather?: boolean;
};

const breastfeeds = (p: ParentProfile) => p.feeding === "breast" || p.feeding === "both";
const textured = (p: ParentProfile) => p.hairType === "curly" || p.hairType === "coily";

const TEMPLATES: Template[] = [
  { name: "Bassinet", category: "Sleep", priority: "must-have", qty: 1, perBaby: true, searchQuery: "bassinet", reason: "Keeps baby close and safe in your room for the first months.", skipIfHave: "bassinet" },
  { name: "Crib", category: "Sleep", priority: "later", qty: 1, perBaby: true, searchQuery: "convertible crib", reason: "A long-term safe sleep spot once baby outgrows the bassinet.", skipIfHave: "crib", when: (p) => p.home !== "apartment" },
  { name: "Mini crib", category: "Sleep", priority: "later", qty: 1, perBaby: true, searchQuery: "mini crib", reason: "A full safe sleep space that fits smaller rooms.", skipIfHave: "crib", when: (p) => p.home === "apartment" },
  { name: "Crib mattress", category: "Sleep", priority: "later", qty: 1, perBaby: true, searchQuery: "firm crib mattress", reason: "A firm, flat mattress is the foundation of safe sleep.", skipIfHave: "crib" },
  { name: "Fitted sheets", category: "Sleep", priority: "must-have", qty: 3, perBaby: true, searchQuery: "fitted bassinet sheets", reason: "Spares mean no 3am laundry after a leak." },
  { name: "Swaddles", category: "Sleep", priority: "must-have", qty: 3, perBaby: true, searchQuery: "zip swaddle newborn", reason: "Helps newborns feel snug and settle faster." },
  { name: "Muslin swaddle blankets", keep: true, weather: true, category: "Sleep", priority: "nice-to-have", qty: 2, searchQuery: "muslin swaddle blankets", reason: "Light and breathable for warm months.", when: (p) => seasonFor(p.dueDate) === "hot" },
  { name: "Sleep sacks", category: "Sleep", priority: "nice-to-have", qty: 2, perBaby: true, searchQuery: "wearable blanket sleep sack", reason: "A safe blanket alternative once swaddling ends." },
  { name: "Satin crib sheet", keep: true, category: "Sleep", priority: "nice-to-have", qty: 2, searchQuery: "satin crib sheet", reason: "Gentle on curls and helps keep moisture in.", when: textured },
  { name: "White noise machine", category: "Sleep", priority: "nice-to-have", qty: 1, searchQuery: "white noise machine baby", reason: "Masks household sounds so naps last longer." },
  { name: "Travel crib", keep: true, category: "Sleep", priority: "nice-to-have", qty: 1, searchQuery: "portable travel crib play yard", reason: "A safe sleep spot at grandma's or on the road.", when: (p) => p.travel === true || p.household.includes("grandparents") },
  { name: "Portable sound machine", keep: true, category: "Sleep", priority: "nice-to-have", qty: 1, searchQuery: "portable travel sound machine", reason: "Brings the bedtime sound from home on trips.", when: (p) => p.travel === true },
  { name: "Baby monitor", category: "Sleep", priority: "nice-to-have", qty: 1, searchQuery: "video baby monitor", reason: "Peace of mind while baby naps in another room.", when: (p) => p.home !== "apartment" },
  { name: "Bottles", category: "Feeding", priority: "must-have", qty: 6, perBaby: true, searchQuery: "anti colic baby bottles", reason: "Useful for formula, pumped milk, or giving a partner a turn." },
  { name: "Bottle labels", keep: true, category: "Feeding", priority: "must-have", qty: 1, searchQuery: "baby bottle labels daycare", reason: "Daycare asks for every bottle to be labeled.", when: (p) => p.work === "back-to-work" },
  { name: "Breast pump", category: "Feeding", priority: "must-have", qty: 1, searchQuery: "electric breast pump", reason: "Often covered by insurance and gives you flexibility.", when: breastfeeds },
  { name: "Pump bag", keep: true, category: "Feeding", priority: "nice-to-have", qty: 1, searchQuery: "breast pump bag", reason: "Keeps your pump and parts together on workdays.", when: (p) => breastfeeds(p) && p.work === "back-to-work" },
  { name: "Milk cooler bag", keep: true, category: "Feeding", priority: "must-have", qty: 1, searchQuery: "breast milk cooler bag", reason: "Keeps pumped milk cold on the way home from work.", when: (p) => breastfeeds(p) && p.work === "back-to-work" },
  { name: "Spare pump parts", keep: true, category: "Feeding", priority: "must-have", qty: 1, searchQuery: "breast pump replacement parts", reason: "A second set means no washing parts at work.", when: (p) => breastfeeds(p) && p.work === "back-to-work" },
  { name: "Nursing pillow", category: "Feeding", priority: "nice-to-have", qty: 1, searchQuery: "nursing pillow", reason: "Saves your back and arms during long feeds.", when: (p) => p.feeding !== "formula" },
  { name: "Formula dispenser", category: "Feeding", priority: "nice-to-have", qty: 1, searchQuery: "formula dispenser on the go", reason: "Pre-measured formula makes night feeds faster.", when: (p) => p.feeding === "formula" || p.feeding === "both" },
  { name: "Bottle brush & drying rack", category: "Feeding", priority: "must-have", qty: 1, searchQuery: "bottle drying rack and brush", reason: "Keeps bottle cleanup simple and tidy." },
  { name: "Burp cloths", category: "Feeding", priority: "must-have", qty: 6, perBaby: true, searchQuery: "muslin burp cloths", reason: "You'll use these constantly. Trust us." },
  { name: "High chair", category: "Feeding", priority: "later", qty: 1, perBaby: true, searchQuery: "compact high chair", reason: "Ready for solids around six months.", skipIfHave: "high chair" },
  { name: "Diapers (newborn & size 1)", category: "Diapering", priority: "must-have", qty: 4, perBaby: true, searchQuery: "newborn diapers", reason: "Babies go through 8-12 a day early on." },
  { name: "Wipes", category: "Diapering", priority: "must-have", qty: 4, perBaby: true, searchQuery: "sensitive baby wipes", reason: "Gentle, fragrance-free wipes for tender skin." },
  { name: "Changing pad", category: "Diapering", priority: "must-have", qty: 1, searchQuery: "contoured changing pad", reason: "A safe, wipeable spot for changes." },
  { name: "Diaper cream", category: "Diapering", priority: "must-have", qty: 2, searchQuery: "diaper rash cream", reason: "Stops rash before it starts." },
  { name: "Diaper pail", category: "Diapering", priority: "nice-to-have", qty: 1, searchQuery: "odor locking diaper pail", reason: "Keeps smells contained, especially in a small space." },
  { name: "Baby bathtub", category: "Bath", priority: "must-have", qty: 1, searchQuery: "infant bathtub", reason: "Supports baby so bath time feels less nerve-wracking." },
  { name: "Hooded towels", category: "Bath", priority: "must-have", qty: 2, searchQuery: "hooded baby towel", reason: "Keeps baby warm right out of the bath." },
  { name: "Gentle baby wash", category: "Bath", priority: "must-have", qty: 1, searchQuery: "tear free baby wash", reason: "Mild, tear-free wash for sensitive skin.", when: (p) => p.sensitiveSkin !== true },
  { name: "Fragrance-free baby wash", keep: true, category: "Bath", priority: "must-have", qty: 1, searchQuery: "fragrance free eczema baby wash", reason: "Gentle on skin that's prone to eczema.", when: (p) => p.sensitiveSkin === true },
  { name: "Eczema balm", keep: true, category: "Bath", priority: "must-have", qty: 1, searchQuery: "baby eczema balm", reason: "Soothes dry patches before they get itchy.", when: (p) => p.sensitiveSkin === true },
  { name: "Soft baby brush", category: "Bath", priority: "nice-to-have", qty: 1, searchQuery: "soft baby hair brush", reason: "Gentle on a tender scalp.", when: (p) => !textured(p) },
  { name: "Wide-tooth comb", keep: true, category: "Bath", priority: "must-have", qty: 1, searchQuery: "baby wide tooth comb", reason: "Detangles curls gently, without pulling.", when: textured },
  { name: "Detangling brush", keep: true, category: "Bath", priority: "nice-to-have", qty: 1, searchQuery: "baby detangling brush", reason: "Soft bristles made for curly and coily hair.", when: textured },
  { name: "Leave-in moisturizer", keep: true, category: "Bath", priority: "nice-to-have", qty: 1, searchQuery: "baby leave in conditioner for curly hair", reason: "Keeps baby's curls soft between washes.", when: textured },
  { name: "Infant car seat", category: "On-the-go", priority: "must-have", qty: 1, perBaby: true, searchQuery: "infant car seat", reason: "Required to bring baby home from the hospital.", skipIfHave: "car seat" },
  { name: "Stroller", category: "On-the-go", priority: "must-have", qty: 1, searchQuery: "lightweight compact stroller", reason: "Gets you both out of the house for fresh air.", skipIfHave: "stroller", when: (p) => p.babies === 1 },
  { name: "Double stroller", keep: true, category: "On-the-go", priority: "must-have", qty: 1, searchQuery: "double stroller", reason: "One stroller for both babies.", skipIfHave: "stroller", when: (p) => p.babies > 1 },
  { name: "Stroller footmuff", keep: true, weather: true, category: "On-the-go", priority: "nice-to-have", qty: 1, searchQuery: "stroller footmuff", reason: "Keeps baby cozy on cold walks.", when: (p) => seasonFor(p.dueDate) === "cold" },
  { name: "Stroller fan", keep: true, weather: true, category: "On-the-go", priority: "nice-to-have", qty: 1, searchQuery: "clip on stroller fan", reason: "A breeze for hot days out.", when: (p) => seasonFor(p.dueDate) === "hot" },
  { name: "Baby carrier", category: "On-the-go", priority: "must-have", qty: 1, searchQuery: "ergonomic baby carrier", reason: "Hands-free comfort for baby, and freedom for you.", when: (p) => p.hasCar === false },
  { name: "Baby carrier", category: "On-the-go", priority: "nice-to-have", qty: 1, searchQuery: "ergonomic baby carrier", reason: "Hands-free snuggles while you get things done.", when: (p) => p.hasCar !== false },
  { name: "Diaper bag", category: "On-the-go", priority: "must-have", qty: 1, searchQuery: "backpack diaper bag", reason: "Everything you need in one grab-and-go spot." },
  { name: "Car mirror", category: "On-the-go", priority: "nice-to-have", qty: 1, searchQuery: "baby car mirror", reason: "See baby in the rear-facing seat while you drive.", when: (p) => p.hasCar !== false },
  { name: "Car seat travel bag", keep: true, category: "On-the-go", priority: "nice-to-have", qty: 1, searchQuery: "car seat travel bag", reason: "Protects the car seat when you fly.", when: (p) => p.travel === true },
  { name: "Travel stroller", keep: true, category: "On-the-go", priority: "nice-to-have", qty: 1, searchQuery: "lightweight travel stroller", reason: "Folds small enough for planes and trunks.", when: (p) => p.travel === true && p.babies === 1 },
  { name: "Bodysuits (0-3 mo)", category: "Clothing", priority: "must-have", qty: 8, perBaby: true, searchQuery: "newborn bodysuits", reason: "The everyday basic. Easy snaps make changes quick." },
  { name: "Zip sleepers", category: "Clothing", priority: "must-have", qty: 6, perBaby: true, searchQuery: "zip footed sleeper newborn", reason: "Zippers beat snaps at 3am." },
  { name: "Fleece footie pajamas", keep: true, weather: true, category: "Clothing", priority: "must-have", qty: 3, perBaby: true, searchQuery: "baby fleece footie pajamas", reason: "Extra warmth for cold nights.", when: (p) => seasonFor(p.dueDate) === "cold" },
  { name: "Bunting", keep: true, weather: true, category: "Clothing", priority: "must-have", qty: 1, perBaby: true, searchQuery: "baby bunting snowsuit", reason: "Bundles baby up for winter trips outside.", when: (p) => seasonFor(p.dueDate) === "cold" },
  { name: "Short-sleeve bodysuits", keep: true, weather: true, category: "Clothing", priority: "must-have", qty: 6, perBaby: true, searchQuery: "short sleeve baby bodysuits", reason: "Light layers for hot days.", when: (p) => seasonFor(p.dueDate) === "hot" },
  { name: "Socks & mittens", category: "Clothing", priority: "nice-to-have", qty: 1, perBaby: true, searchQuery: "newborn socks and mittens", reason: "Keeps tiny hands and feet warm." },
  { name: "Thermometer", category: "Health", priority: "must-have", qty: 1, searchQuery: "baby thermometer", reason: "A quick, reliable read when baby feels warm." },
  { name: "Nail clippers", category: "Health", priority: "must-have", qty: 1, searchQuery: "baby nail clippers", reason: "Tiny nails grow fast and scratch." },
  { name: "Nasal aspirator", category: "Health", priority: "must-have", qty: 1, searchQuery: "baby nasal aspirator", reason: "Helps a congested baby breathe and feed." },
  { name: "Humidifier", category: "Health", priority: "nice-to-have", qty: 1, searchQuery: "cool mist humidifier", reason: "Eases stuffy noses during cold season." },
  { name: "Baby gate", keep: true, category: "Health", priority: "later", qty: 1, searchQuery: "pressure mounted baby gate", reason: "Keeps pets and baby in their own spaces.", when: (p) => p.household.includes("pets") },
  { name: "Play mat", category: "Play", priority: "nice-to-have", qty: 1, searchQuery: "baby play gym mat", reason: "A safe spot for tummy time and kicking." },
  { name: "Bouncer", category: "Play", priority: "nice-to-have", qty: 1, perBaby: true, searchQuery: "baby bouncer", reason: "A safe place to set baby down for a few minutes.", skipIfHave: "bouncer" },
  { name: "Board books with diverse families", category: "Play", priority: "later", qty: 1, searchQuery: "diverse families baby board books", reason: "Stories where every kind of family shows up.", keep: true },
  { name: "Soft baby doll", category: "Play", priority: "later", qty: 1, searchQuery: "soft baby doll", reason: "Pick one that looks like your family.", keep: true },
  { name: "Big sibling gift", keep: true, category: "Play", priority: "nice-to-have", qty: 1, searchQuery: "big sibling book", reason: "Helps the big kid feel part of the welcome.", when: (p) => p.household.includes("siblings") },
  { name: "Teething toys", category: "Play", priority: "later", qty: 2, searchQuery: "baby teething toys", reason: "Something safe to chew when teeth come in.", when: (p) => p.circle === "big" },
  { name: "Bath toys", category: "Play", priority: "later", qty: 1, searchQuery: "baby bath toys", reason: "Makes bath time play time.", when: (p) => p.circle === "big" },
  { name: "Activity center", category: "Play", priority: "later", qty: 1, searchQuery: "baby activity center", reason: "Keeps an older baby busy and happy.", when: (p) => p.circle === "big" },
  { name: "Soft blocks", category: "Play", priority: "later", qty: 1, searchQuery: "soft baby blocks", reason: "Stack, squish, and knock down.", when: (p) => p.circle === "big" },
  { name: "Peri bottle", keep: true, category: "For the parents", priority: "must-have", qty: 1, searchQuery: "postpartum peri bottle", reason: "Makes the first days of recovery more comfortable." },
  { name: "Postpartum pads", keep: true, category: "For the parents", priority: "must-have", qty: 2, searchQuery: "postpartum pads", reason: "You'll want plenty for the first weeks." },
  { name: "Soft robe", category: "For the parents", priority: "nice-to-have", qty: 1, searchQuery: "soft postpartum robe", reason: "Comfy for hospital photos and long nights." },
  { name: "Big water bottle", category: "For the parents", priority: "nice-to-have", qty: 1, searchQuery: "large water bottle with straw", reason: "Recovery is thirsty work." },
  { name: "Nipple balm", keep: true, category: "For the parents", priority: "must-have", qty: 1, searchQuery: "nipple balm", reason: "Soothes soreness in the early weeks of nursing.", when: breastfeeds },
  { name: "Nursing bras", keep: true, category: "For the parents", priority: "must-have", qty: 2, searchQuery: "nursing bras", reason: "Easy access and support for feeds.", when: breastfeeds },
];

function withSex(item: GeneratedItem, profile: ParentProfile) {
  const sex = profile.babySex === "boy" || profile.babySex === "girl" ? profile.babySex : null;
  if (item.category !== "Clothing" || !sex || /\b(boys?|girls?)\b/i.test(item.searchQuery)) return item.searchQuery;
  return `baby ${sex} ${item.searchQuery.replace(/^baby\s+/i, "")}`;
}

function adjustQuery(item: GeneratedItem, profile: ParentProfile) {
  const prefix = [profile.values.includes("organic") ? "organic" : "", profile.budget === "lean" ? "affordable" : ""]
    .filter(Boolean)
    .join(" ");
  const query = withSex(item, profile);
  return prefix ? `${prefix} ${query}` : query;
}

function bilingualBooks(profile: ParentProfile): Picked[] {
  return profile.languages.slice(0, 2).map((language) => ({
    personal: true,
    name: `${language} bilingual board books`,
    category: "Play",
    priority: "nice-to-have",
    qty: 1,
    searchQuery: `${language.toLowerCase()} english bilingual baby board books`,
    reason: `Stories in ${language} and English from day one.`,
  }));
}

type Picked = GeneratedItem & { personal: boolean };

const DROP_ORDER: GeneratedItem["priority"][] = ["later", "nice-to-have"];

/**
 * Trims generic extras from the end until the list fits how many people will shop it.
 * Must-haves and anything picked for this family always stay, even if that runs a little long.
 */
function fitToCircle(items: Picked[], max: number): GeneratedItem[] {
  const out = [...items];
  for (const priority of DROP_ORDER) {
    for (let i = out.length - 1; i >= 0 && out.length > max; i--) {
      if (out[i].priority === priority && !out[i].personal) out.splice(i, 1);
    }
  }
  return out.map(({ personal: _personal, ...item }) => item);
}

function applies(t: Template, profile: ParentProfile) {
  return (!t.when || t.when(profile)) && (!t.skipIfHave || !profile.alreadyHave.includes(t.skipIfHave));
}

function toItem({ when: _when, skipIfHave: _skip, perBaby, keep, weather: _weather, ...item }: Template, profile: ParentProfile): Picked {
  const cold = seasonFor(profile.dueDate) === "cold";
  return {
    ...item,
    personal: Boolean(keep),
    priority: item.name === "Humidifier" && cold ? "must-have" : item.priority,
    qty: Math.min(20, (perBaby ? item.qty * profile.babies : item.qty) + (item.name === "Bottles" && profile.work === "back-to-work" ? 4 : 0)),
    searchQuery: adjustQuery(item, profile),
  };
}

/** Items picked for this family's answers, which the AI must include. */
export function requiredItems(profile: ParentProfile): GeneratedItem[] {
  const picked = TEMPLATES.filter((t) => t.keep && !t.weather && applies(t, profile)).map((t) => toItem(t, profile));
  return [...picked, ...bilingualBooks(profile)].map(({ personal: _personal, ...item }) => item as GeneratedItem);
}

export function mockItems(profile: ParentProfile): GeneratedItem[] {
  const simple = profile.values.includes("simple");
  const items = TEMPLATES.filter((t) => applies(t, profile))
    .filter((t) => !(simple && t.priority === "nice-to-have" && (t.category === "Play" || t.category === "On-the-go")))
    .map((t) => toItem(t, profile));
  const max = Math.min(ITEM_RANGE[profile.circle][1], simple ? ITEM_RANGE.small[1] : Infinity);
  return fitToCircle([...items, ...bilingualBooks(profile)], max);
}
