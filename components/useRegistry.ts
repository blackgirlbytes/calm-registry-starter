"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { ItemStatus, Registry } from "@/lib/types";

export function useRegistry(id: string) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const { registry } = await api<{ registry: Registry }>(`/api/registries/${id}`);
      setRegistry(registry);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load registry.");
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setStatus = useCallback(
    async (itemId: string, status: ItemStatus) => {
      setRegistry((r) => r && { ...r, items: r.items.map((i) => (i.id === itemId ? { ...i, status } : i)) });
      await api(`/api/registries/${id}`, { method: "PATCH", body: JSON.stringify({ action: "status", itemId, status }) }).catch(
        (e: Error) => setError(e.message),
      );
    },
    [id],
  );

  const setQty = useCallback(
    async (itemId: string, qty: number) => {
      setRegistry((r) => r && { ...r, items: r.items.map((i) => (i.id === itemId ? { ...i, qty } : i)) });
      await api(`/api/registries/${id}`, { method: "PATCH", body: JSON.stringify({ action: "qty", itemId, qty }) }).catch(
        (e: Error) => setError(e.message),
      );
    },
    [id],
  );

  const setPrimary = useCallback(
    async (itemId: string, offerId: string) => {
      setRegistry(
        (r) =>
          r && {
            ...r,
            items: r.items.map((i) =>
              i.id === itemId
                ? {
                    ...i,
                    offers: i.offers
                      .map((o) => ({ ...o, isPrimary: o.id === offerId }))
                      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
                  }
                : i,
            ),
          },
      );
      await api(`/api/registries/${id}`, { method: "PATCH", body: JSON.stringify({ action: "primary", itemId, offerId }) }).catch(
        (e: Error) => setError(e.message),
      );
    },
    [id],
  );

  /** Swaps in a product the parent already has in mind. Resolves to the updated item; throws if it fails. */
  const pickItem = useCallback(
    async (itemId: string, product: string) => {
      await api(`/api/registries/${id}`, { method: "PATCH", body: JSON.stringify({ action: "pick", itemId, product }) });
      const { registry } = await api<{ registry: Registry }>(`/api/registries/${id}`);
      setRegistry(registry);
      return registry.items.find((i) => i.id === itemId) ?? null;
    },
    [id],
  );

  return { registry, error, reload, setStatus, setPrimary, setQty, pickItem };
}
