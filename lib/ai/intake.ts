import "server-only";
import { z } from "zod";
import { ParentProfileSchema, type ChatMessage, type ParentProfile, type ProfileSeed, type RetailerId } from "../types";
import { describeSeed } from "../answers";
import { BUILD_NOW, BUILD_NOW_PATTERN, ESSENTIAL_STEPS, OFFER_STEP, QUICK_STEPS, stepsFor, type IntakeStep } from "../intake-steps";
import { coerceProfile, PROFILE_DEFAULTS } from "../profile";
import { callJson, isOpenAIConfigured } from "./openai";
import { INTAKE_GUIDANCE, seedGuidance, todayLine, WRAP_UP } from "./prompts";

export const IntakeTurnSchema = z.object({
  reply: z.string().describe("Your next short, warm message. One question at a time."),
  chips: z.array(z.string()).describe("2-5 short tap-to-answer options for the question you asked"),
  done: z.boolean().describe("True once you know enough to build the registry"),
  profile: ParentProfileSchema.nullable().describe("Filled in only when done is true"),
});
export type IntakeTurn = z.infer<typeof IntakeTurnSchema>;

const ALL_STEPS = [...ESSENTIAL_STEPS, OFFER_STEP, ...QUICK_STEPS];

function systemPrompt(seed: ProfileSeed | null) {
  return `${INTAKE_GUIDANCE}
- Offer 1-5 tap-to-answer chips matching your question. Each chip is sent as their answer, so it must read as one.
  Use these chips for these questions:
${ALL_STEPS.map((s) => `  "${s.ask}" → ${JSON.stringify(s.chips)}`).join("\n")}
  For the names, city, and language questions, they'll type the answer; the chips are only for skipping.
- If they correct an earlier answer, use the new one.
- When you're done, set done=true, fill in profile, and reply with about this: "${WRAP_UP}"
${seed ? `${seedGuidance(seed)}\n` : ""}${todayLine()}`;
}

export const OPENING: IntakeTurn = {
  reply: `Hi! I'll put together a registry for you, so you don't have to start from a blank page. Just a few quick questions, and you can tap an answer or type anything. First, ${ESSENTIAL_STEPS[0].ask.replace(/^W/, "w")}`,
  chips: ESSENTIAL_STEPS[0].chips,
  done: false,
  profile: null,
};

/** From the third question on, a tired parent can stop and let defaults fill the rest. */
function withBuildNow(turn: IntakeTurn, answered: number): IntakeTurn {
  if (turn.done || answered < 2 || turn.chips.some((c) => BUILD_NOW_PATTERN.test(c))) return turn;
  return { ...turn, chips: [...turn.chips.slice(0, 5), BUILD_NOW] };
}

export function openingTurn(seed: ProfileSeed | null): IntakeTurn {
  const kept = seed ? describeSeed(seed) : "";
  if (!kept) return OPENING;
  return {
    ...OPENING,
    reply: `Welcome back! I kept a few answers from last time: ${kept}. You can change any of them before I build. When is this little one (or little ones!) due?`,
  };
}

export async function nextIntakeTurn(messages: ChatMessage[], seed: ProfileSeed | null = null): Promise<IntakeTurn> {
  const answered = messages.filter((m) => m.role === "user").length;
  if (!isOpenAIConfigured()) return withBuildNow(mockIntakeTurn(messages, seed), answered);
  const turn = await callJson("intake_turn", IntakeTurnSchema, [{ role: "system", content: systemPrompt(seed) }, ...messages]);
  if (turn.profile) turn.profile = coerceProfile(turn.profile);
  return withBuildNow(turn, answered);
}

// ---------------------------------------------------------------------------
// Scripted fallback so the flow works without an OpenAI key.

const ACKS = ["Lovely.", "Thank you.", "Got it.", "Okay.", "Perfect."];

function dueDateFrom(answer: string) {
  const months = /1-2/.test(answer) ? 1.5 : /3-5/.test(answer) ? 4 : /6\+/.test(answer) ? 6.5 : null;
  const explicit = answer.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (explicit) return explicit;
  if (months === null) return null;
  const date = new Date(Date.now() + months * 30 * 24 * 3600 * 1000);
  return date.toISOString().slice(0, 10);
}

function yesNo(answer: string): boolean | null {
  if (/^(no|nope|not much|not really|none)\b/.test(answer)) return false;
  if (/^(yes|yeah|yep|sure)\b|eczema|sensitive|travel|fly/.test(answer)) return true;
  return null;
}

function babyFrom(answer: string): Pick<ParentProfile, "babySex" | "babies"> {
  const babies = /triplet/.test(answer) ? 3 : /twin|two babies/.test(answer) ? 2 : 1;
  const boy = /\bboys?\b|\bson\b/.test(answer);
  const girl = /\bgirls?\b|\bdaughter\b/.test(answer);
  const babySex = /one of each|boy and (a )?girl|girl and (a )?boy/.test(answer)
    ? "mixed"
    : boy && !girl
      ? "boy"
      : girl && !boy
        ? "girl"
        : /surprise/.test(answer)
          ? "surprise"
          : "unknown";
  return { babySex, babies };
}

/** Where the parent asked to stop, as an index into their answers; everything after is unasked. */
function stopIndex(raw: string[], asked: IntakeStep[]) {
  const index = raw.findIndex((answer, i) => BUILD_NOW_PATTERN.test(answer) || (asked[i]?.key === "offer" && /^no\b/i.test(answer)));
  return index === -1 ? raw.length : index;
}

export function mockProfile(messages: ChatMessage[], seed: ProfileSeed | null = null): ParentProfile {
  const all = messages.filter((m) => m.role === "user").map((m) => m.content.trim());
  const asked = stepsFor(seed);
  const raw = all.slice(0, stopIndex(all, asked));
  const answer = (key: string) => {
    const index = asked.findIndex((s) => s.key === key);
    return index === -1 ? "" : (raw[index] ?? "");
  };
  const at = (key: string) => answer(key).toLowerCase();
  const rawNames = answer("names");
  const [parentPart, babyPart] = rawNames.split(/[,.;]\s*(?:and\s+)?(?:the\s+)?baby(?:'s name)?(?:\s+is|\s+will be)?\s*/i);
  const stores: RetailerId[] = (["amazon", "walmart", "target"] as const).filter((s) => at("preferredRetailers").includes(s));
  const haves = ["crib", "stroller", "car seat", "bassinet", "high chair", "bouncer"].filter((h) => at("alreadyHave").includes(h));
  const homeCar = at("homeCar");
  const household = at("household");
  const feeding = at("feeding");
  const work = at("work");
  const circle = at("circle");
  const values = at("values");
  const hair = at("hairType");
  const language = answer("languages");
  const baby = babyFrom(`${at("baby")} ${at("dueDate")}`);
  return {
    ...PROFILE_DEFAULTS,
    parentNames: /^skip/i.test(rawNames) ? "" : (parentPart ?? "").replace(/^(we're|we are|i'm|i am)\s+/i, ""),
    babyName: babyPart?.trim() ?? "",
    dueDate: dueDateFrom(at("dueDate")),
    ...baby,
    city: /^skip/i.test(answer("city")) ? "" : answer("city"),
    home: homeCar.includes("apartment") ? "apartment" : homeCar.includes("house") ? "house" : "unknown",
    hasCar: /no car|walk|transit|don'?t drive/.test(homeCar) ? false : /car|drive/.test(homeCar) ? true : null,
    household: [
      ...(/big kid|sibling|brother|sister|son|daughter|toddler|kids/.test(household) ? (["siblings"] as const) : []),
      ...(/pet|dog|cat/.test(household) ? (["pets"] as const) : []),
      ...(/grand|nana|abuela|my mom|in-law/.test(household) ? (["grandparents"] as const) : []),
    ],
    feeding: feeding.includes("mix") || feeding.includes("both")
      ? "both"
      : feeding.includes("breast")
        ? "breast"
        : feeding.includes("formula")
          ? "formula"
          : "unsure",
    work: /work|daycare|job/.test(work) ? "back-to-work" : /home|stay/.test(work) ? "home" : "unsure",
    alreadyHave: haves,
    preferredRetailers: stores,
    travel: yesNo(at("travel")),
    hairType: (["straight", "wavy", "coily", "curly"] as const).find((h) => hair.includes(h.slice(0, 4))) ?? "unknown",
    sensitiveSkin: yesNo(at("sensitiveSkin")),
    languages: /^(just english|english|no|none|skip)\b/i.test(language)
      ? []
      : language.replace(/^(yes,?\s*)?(we speak\s*)?/i, "").split(/,|\band\b|&/).map((l) => l.trim()),
    circle: /small/.test(circle) ? "small" : /big|large|crowd/.test(circle) ? "big" : "medium",
    values: [...(/organic|eco/.test(values) ? (["organic"] as const) : []), ...(/simple|minimal/.test(values) ? (["simple"] as const) : [])],
    notes: /not our first|have lots/.test(at("alreadyHave")) ? "Not their first baby; they have a lot from before." : "",
    ...seed,
  };
}

function mockIntakeTurn(messages: ChatMessage[], seed: ProfileSeed | null): IntakeTurn {
  const all = messages.filter((m) => m.role === "user").map((m) => m.content.trim());
  const asked = stepsFor(seed);
  if (stopIndex(all, asked) < all.length || all.length >= asked.length) {
    return { reply: `Thank you, that's everything I need. ${WRAP_UP}`, chips: [], done: true, profile: coerceProfile(mockProfile(messages, seed)) };
  }
  const step = asked[all.length];
  const reply = all.length === 0 ? openingTurn(seed).reply : `${ACKS[all.length % ACKS.length]} ${step.ask}`;
  return { reply, chips: step.chips, done: false, profile: null };
}
