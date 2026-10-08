import type { Offer, RetailerId } from "../types";
import { RETAILER_LABELS } from "../types";

const SEARCH_URLS: Record<RetailerId, (q: string) => string> = {
  amazon: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  walmart: (q) => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  target: (q) => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
};

/** An honest fallback when we have no real product: a link to the store's own search. */
export function searchLinkOffer(retailer: RetailerId, query: string): Offer {
  return {
    retailer,
    externalId: `search:${retailer}:${query.toLowerCase()}`,
    title: `Search ${RETAILER_LABELS[retailer]} for “${query}”`,
    price: null,
    imageUrl: null,
    url: SEARCH_URLS[retailer](query),
    rating: null,
    inStock: true,
  };
}
