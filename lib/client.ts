"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Offer } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

export function getBrowserSupabase() {
  if (!url || !anonKey) return null;
  browserClient ??= createClient(url, anonKey);
  return browserClient;
}

export const authEnabled = Boolean(url && anonKey);

/** Fired after anything that changes which registries or drafts exist, or their titles, so navigation can refresh. */
export const REGISTRIES_CHANGED = "calm-registry:registries-changed";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  const supabase = getBrowserSupabase();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.set("authorization", `Bearer ${data.session.access_token}`);
  }
  const response = await fetch(path, { ...init, headers });
  const json = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(json.error ?? "Something went wrong.");
  const method = (init.method ?? "GET").toUpperCase();
  // Draft autosaves (PUT) happen constantly and never change the list.
  const listChanged = /^\/api\/(registries|drafts)/.test(path) && method !== "GET" && !(method === "PUT" && path.startsWith("/api/drafts/"));
  if (listChanged) window.dispatchEvent(new Event(REGISTRIES_CHANGED));
  return json;
}

export { formatPrice } from "./format";

export function totalPrice(offers: Offer[], qty: number) {
  const price = offers[0]?.price;
  return price ? price * qty : 0;
}

export const PRIORITY_LABELS = {
  "must-have": "Needed in the first weeks",
  "nice-to-have": "Nice to have",
  later: "For later, around 3 to 12 months",
} as const;
