import type { ParentProfile, ProfileSeed } from "./types";

/** The questions, in order. Shared by the AI guide, the scripted fallback, and the progress count. */
export type IntakeStep = {
  key: string;
  /** Profile fields the answer fills. The question is skipped when carried-over answers cover all of them. */
  fields: (keyof ParentProfile)[];
  ask: string;
  chips: string[];
};

export const BUILD_NOW = "Just build it";
export const BUILD_NOW_PATTERN = /\bjust build\b|\bbuild it\b|\bbuild (it )?now\b/i;

export const ESSENTIAL_STEPS: IntakeStep[] = [
  {
    key: "dueDate",
    fields: ["dueDate"],
    ask: "When is your little one (or little ones!) due?",
    chips: ["In 1-2 months", "In 3-5 months", "6+ months away", "Not sure yet"],
  },
  {
    key: "names",
    fields: ["parentNames", "babyName"],
    ask: "What should family call you? And if you've picked a name for baby, I'd love to hear it, but that's optional.",
    chips: ["Skip for now"],
  },
  {
    key: "baby",
    fields: ["babySex", "babies"],
    ask: "Do you know if it's a boy or a girl, or is it a surprise?",
    chips: ["A boy", "A girl", "It's a surprise", "Twins!"],
  },
  {
    key: "city",
    fields: ["city"],
    ask: "What city are you in? It helps me plan for the weather.",
    chips: ["Skip for now"],
  },
  {
    key: "homeCar",
    fields: ["home", "hasCar"],
    ask: "Apartment or house? And will you be driving with baby?",
    chips: ["Apartment, no car", "Apartment + car", "House + car", "House, no car"],
  },
  {
    key: "household",
    fields: ["household"],
    ask: "Who's at home besides you? Any big kids, pets, or grandparents?",
    chips: ["Just us", "Big kids", "Pets", "Grandparents"],
  },
  {
    key: "feeding",
    fields: ["feeding"],
    ask: "How are you thinking about feeding? Totally fine to not know yet.",
    chips: ["Breastfeeding", "Formula", "A mix", "Not sure"],
  },
  {
    key: "work",
    fields: ["work"],
    ask: "Will you head back to work, or be home with baby for a while?",
    chips: ["Back to work", "Home with baby", "Not sure yet"],
  },
  {
    key: "alreadyHave",
    fields: ["alreadyHave"],
    ask: "Anything already covered? Hand-me-downs, or things you're buying yourself?",
    chips: ["Crib", "Stroller", "Car seat", "Not our first, we have lots", "Nothing yet"],
  },
  {
    key: "preferredRetailers",
    fields: ["preferredRetailers"],
    ask: "Where would you like gifts to come from: Amazon, Target, or Walmart?",
    chips: ["Amazon", "Target", "Walmart", "Any of them"],
  },
];

export const OFFER_STEP: IntakeStep = {
  key: "offer",
  fields: [],
  ask: "I have enough to build a good list. Want a few quick ones so I can personalize it? About thirty seconds.",
  chips: ["Sure, quick ones", BUILD_NOW],
};

export const QUICK_STEPS: IntakeStep[] = [
  {
    key: "travel",
    fields: ["travel"],
    ask: "Will you travel with baby, like flying to see family?",
    chips: ["Yes, we'll travel", "Not much"],
  },
  {
    key: "hairType",
    fields: ["hairType"],
    ask: "So I pick the right bath and hair care: does hair in your family tend to be straight, wavy, curly, or coily?",
    chips: ["Straight", "Wavy", "Curly", "Coily", "Not sure"],
  },
  {
    key: "sensitiveSkin",
    fields: ["sensitiveSkin"],
    ask: "Does sensitive skin or eczema run in the family?",
    chips: ["Yes", "No", "Not sure"],
  },
  {
    key: "languages",
    fields: ["languages"],
    ask: "Do you speak another language at home? Tell me which one, if so.",
    chips: ["Just English"],
  },
  {
    key: "circle",
    fields: ["circle"],
    ask: "Big family crowd, or a small circle?",
    chips: ["Small circle", "Somewhere in between", "Big crowd"],
  },
  {
    key: "values",
    fields: ["values"],
    ask: "Last one: want me to lean organic, or keep the list extra simple?",
    chips: ["Lean organic", "Keep it simple", "Neither"],
  },
];

function unknown(step: IntakeStep, seed: ProfileSeed | null) {
  return !seed || !step.fields.every((field) => field in seed);
}

/** The questions still worth asking once carried-over answers are known. */
export function stepsFor(seed: ProfileSeed | null): IntakeStep[] {
  const essentials = ESSENTIAL_STEPS.filter((s) => unknown(s, seed));
  const quick = QUICK_STEPS.filter((s) => unknown(s, seed));
  return quick.length ? [...essentials, OFFER_STEP, ...quick] : essentials;
}

/** Questions before the optional quick round, for the "about N left" line. */
export function essentialCount(seed: ProfileSeed | null) {
  return ESSENTIAL_STEPS.filter((s) => unknown(s, seed)).length;
}
