import "server-only";
import { CATEGORIES, EditDiffSchema, type EditDiff, type Registry } from "../types";
import { CATALOG_QUERY_RULE } from "../retail/catalog";
import { callJson, isOpenAIConfigured } from "./openai";

const SYSTEM_PROMPT = `You edit a baby registry based on a parent's plain-language request.
You receive the parent profile, the current items (with ids, primary price, purchased flag), and the request.
Return a minimal diff:
- remove: ids of items to drop (never remove purchased items).
- add: new items (same shape as generation: name, category, priority, reason, qty, searchQuery).
- swap: items to re-search with a new searchQuery (e.g. a cheaper, eco, or compact variant) plus a new one-line reason.
- summary: one short friendly sentence describing what you changed.
Only change what the request asks for. Categories: ${CATEGORIES.join(", ")}.
If babySex is "boy" or "girl", new or swapped clothing searchQuery starts with "baby boy" or "baby girl".
${CATALOG_QUERY_RULE}`;

function itemsForPrompt(registry: Registry) {
  return registry.items
    .filter((i) => i.status !== "skip")
    .map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      priority: i.priority,
      searchQuery: i.searchQuery,
      price: i.offers[0]?.price ?? null,
      purchased: Boolean(i.purchased),
    }));
}

export async function proposeEdit(registry: Registry, request: string): Promise<EditDiff> {
  if (!isOpenAIConfigured()) return mockEdit(registry, request);
  const diff = await callJson("registry_edit", EditDiffSchema, [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: JSON.stringify({ profile: registry.profile, items: itemsForPrompt(registry), request }),
    },
  ]);
  const valid = new Set(registry.items.filter((i) => !i.purchased).map((i) => i.id));
  return {
    ...diff,
    remove: diff.remove.filter((id) => valid.has(id)),
    swap: diff.swap.filter((s) => valid.has(s.id)),
  };
}

function mockEdit(registry: Registry, request: string): EditDiff {
  const text = request.toLowerCase();
  const active = registry.items.filter((i) => i.status !== "skip" && !i.purchased);

  if (/cheap|budget|afford|less expensive|save/.test(text)) {
    const priciest = [...active]
      .sort((a, b) => (b.offers[0]?.price ?? 0) - (a.offers[0]?.price ?? 0))
      .slice(0, 5);
    return {
      summary: `Found budget-friendly options for your ${priciest.length} priciest items.`,
      remove: [],
      add: [],
      swap: priciest.map((i) => ({
        id: i.id,
        searchQuery: `affordable ${i.searchQuery.replace(/\baffordable\s+/g, "")}`,
        reason: `${i.reason} Swapped for a budget-friendly pick.`,
      })),
    };
  }

  if (/eco|organic|sustainab|green/.test(text)) {
    const targets = active.filter((i) => ["Clothing", "Sleep", "Bath", "Diapering"].includes(i.category)).slice(0, 8);
    return {
      summary: `Switched ${targets.length} items to eco-friendly options.`,
      remove: [],
      add: [],
      swap: targets.map((i) => ({ id: i.id, searchQuery: `organic ${i.searchQuery.replace(/\borganic\s+/g, "")}`, reason: `${i.reason} Organic and eco-friendly.` })),
    };
  }

  const haveMatch = text.match(/(?:have|got|getting|handed down|hand-me-down|don'?t need|remove)\s+(?:a |an |the )?(.+)/);
  if (haveMatch) {
    const words = haveMatch[1].split(/,| and /).map((w) => w.trim().replace(/s$/, "")).filter(Boolean);
    const remove = active.filter((i) => words.some((w) => i.name.toLowerCase().includes(w))).map((i) => i.id);
    return {
      summary: remove.length ? `Removed ${remove.length} item(s) you already have.` : "I couldn't find matching items to remove.",
      remove,
      add: [],
      swap: [],
    };
  }

  const addMatch = text.match(/add\s+(?:a |an |some )?(.+)/);
  if (addMatch) {
    const name = addMatch[1].trim();
    return {
      summary: `Added ${name}.`,
      remove: [],
      add: [{ name: name.replace(/\b\w/g, (c) => c.toUpperCase()), category: "Play", priority: "nice-to-have", reason: "You asked for this one.", qty: 1, searchQuery: name }],
      swap: [],
    };
  }

  return {
    summary: "Try something like \"make it cheaper\", \"we already have a crib\", or \"add a baby swing\".",
    remove: [],
    add: [],
    swap: [],
  };
}
