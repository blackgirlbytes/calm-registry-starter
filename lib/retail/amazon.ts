import { createHash, createHmac } from "node:crypto";
import type { Offer } from "../types";
import type { RetailerProvider } from "./provider";

const HOST = "webservices.amazon.com";
const REGION = "us-east-1";
const SERVICE = "ProductAdvertisingAPI";
const PATH = "/paapi5/searchitems";
const TARGET = "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function signHeaders(body: string, accessKey: string, secretKey: string) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    "content-encoding": "amz-1.0",
    "content-type": "application/json; charset=utf-8",
    host: HOST,
    "x-amz-date": amzDate,
    "x-amz-target": TARGET,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${headers[k]}\n`)
    .join("");
  const canonicalRequest = ["POST", PATH, "", canonicalHeaders, signedHeaders, sha256(body)].join("\n");
  const scope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), REGION), SERVICE), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return headers;
}

type PaapiItem = {
  ASIN: string;
  DetailPageURL: string;
  ItemInfo?: { Title?: { DisplayValue?: string } };
  Images?: { Primary?: { Medium?: { URL?: string } } };
  Offers?: { Listings?: Array<{ Price?: { Amount?: number }; Availability?: { Type?: string } }> };
  CustomerReviews?: { StarRating?: { Value?: number } };
};

export const amazonProvider: RetailerProvider = {
  id: "amazon",
  isConfigured() {
    return Boolean(
      process.env.AMAZON_PAAPI_ACCESS_KEY && process.env.AMAZON_PAAPI_SECRET && process.env.AMAZON_PARTNER_TAG,
    );
  },
  async search(query, filters) {
    const body = JSON.stringify({
      Keywords: query,
      SearchIndex: "Baby",
      ItemCount: 3,
      PartnerTag: process.env.AMAZON_PARTNER_TAG,
      PartnerType: "Associates",
      Marketplace: "www.amazon.com",
      ...(filters.maxPrice ? { MaxPrice: Math.round(filters.maxPrice * 100) } : {}),
      Resources: [
        "ItemInfo.Title",
        "Images.Primary.Medium",
        "Offers.Listings.Price",
        "Offers.Listings.Availability.Type",
        "CustomerReviews.StarRating",
      ],
    });
    const response = await fetch(`https://${HOST}${PATH}`, {
      method: "POST",
      headers: signHeaders(body, process.env.AMAZON_PAAPI_ACCESS_KEY!, process.env.AMAZON_PAAPI_SECRET!),
      body,
    });
    if (!response.ok) throw new Error(`Amazon search failed (${response.status})`);
    const data = (await response.json()) as { SearchResult?: { Items?: PaapiItem[] } };
    return (data.SearchResult?.Items ?? []).map(
      (item): Offer => ({
        retailer: "amazon",
        externalId: item.ASIN,
        title: item.ItemInfo?.Title?.DisplayValue ?? query,
        price: item.Offers?.Listings?.[0]?.Price?.Amount ?? null,
        imageUrl: item.Images?.Primary?.Medium?.URL ?? null,
        url: item.DetailPageURL,
        rating: item.CustomerReviews?.StarRating?.Value ?? null,
        inStock: item.Offers?.Listings?.[0]?.Availability?.Type !== "OutOfStock",
      }),
    );
  },
};
