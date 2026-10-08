import type { Offer } from "../types";
import type { RetailerProvider } from "./provider";

/**
 * Target has no public product-search API for affiliates. Instead we create a
 * tracked search deep link through the Target Partners (Impact) link set in
 * TARGET_IMPACT_LINK, e.g. https://goto.target.com/c/<pid>/<adid>/2092
 */
export const targetProvider: RetailerProvider = {
  id: "target",
  isConfigured() {
    return Boolean(process.env.TARGET_IMPACT_LINK);
  },
  async search(query) {
    const destination = `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}&category=5xtly`;
    const url = `${process.env.TARGET_IMPACT_LINK}?u=${encodeURIComponent(destination)}`;
    return [
      {
        retailer: "target",
        externalId: `search:${query.toLowerCase()}`,
        title: `${query} at Target`,
        price: null,
        imageUrl: null,
        url,
        rating: null,
        inStock: true,
      },
    ];
  },
};
