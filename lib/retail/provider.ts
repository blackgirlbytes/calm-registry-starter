import type { Offer, RetailerId } from "../types";

export type SearchFilters = { maxPrice?: number };

export interface RetailerProvider {
  id: RetailerId;
  /** True when real credentials are present; otherwise the mock is used. */
  isConfigured(): boolean;
  search(query: string, filters: SearchFilters): Promise<Offer[]>;
}
