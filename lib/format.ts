/** Shared by server and client components. */
export function formatPrice(price: number | null) {
  return price === null ? "See price" : `$${price.toFixed(2)}`;
}
