import { createSign } from "node:crypto";
import type { Offer } from "../types";
import type { RetailerProvider } from "./provider";

type WalmartItem = {
  itemId: number;
  name: string;
  salePrice?: number;
  mediumImage?: string;
  thumbnailImage?: string;
  productTrackingUrl?: string;
  productUrl?: string;
  customerRating?: string;
  stock?: string;
};

function authHeaders() {
  const consumerId = process.env.WALMART_CONSUMER_ID!;
  const keyVersion = process.env.WALMART_KEY_VERSION ?? "1";
  const privateKey = process.env.WALMART_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const timestamp = Date.now().toString();
  const signer = createSign("RSA-SHA256");
  signer.update(`${consumerId}\n${timestamp}\n${keyVersion}\n`);
  return {
    "WM_CONSUMER.ID": consumerId,
    "WM_CONSUMER.INTIMESTAMP": timestamp,
    "WM_SEC.KEY_VERSION": keyVersion,
    "WM_SEC.AUTH_SIGNATURE": signer.sign(privateKey, "base64"),
  };
}

export const walmartProvider: RetailerProvider = {
  id: "walmart",
  isConfigured() {
    return Boolean(
      process.env.WALMART_CONSUMER_ID && process.env.WALMART_PRIVATE_KEY && process.env.WALMART_PUBLISHER_ID,
    );
  },
  async search(query, filters) {
    const params = new URLSearchParams({
      query,
      numItems: "3",
      publisherId: process.env.WALMART_PUBLISHER_ID!,
    });
    const response = await fetch(
      `https://developer.api.walmart.com/api-proxy/service/affil/product/v2/search?${params}`,
      { headers: authHeaders() },
    );
    if (!response.ok) throw new Error(`Walmart search failed (${response.status})`);
    const data = (await response.json()) as { items?: WalmartItem[] };
    return (data.items ?? [])
      .filter((item) => !filters.maxPrice || (item.salePrice ?? 0) <= filters.maxPrice)
      .map(
        (item): Offer => ({
          retailer: "walmart",
          externalId: String(item.itemId),
          title: item.name,
          price: item.salePrice ?? null,
          imageUrl: item.mediumImage ?? item.thumbnailImage ?? null,
          url: item.productTrackingUrl ?? item.productUrl ?? `https://www.walmart.com/ip/${item.itemId}`,
          rating: item.customerRating ? Number(item.customerRating) : null,
          inStock: item.stock !== "Not available",
        }),
      );
  },
};
