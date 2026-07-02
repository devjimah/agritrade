/**
 * All API money values are integer pesewas (GHS x 100).
 * Convert at the UI boundary only.
 */

export function formatGHS(pesewas: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
  }).format(pesewas / 100);
}

// Plain digits, or digits with well-formed thousands grouping, with at most
// two decimals. Rejects Number()-isms like "0x10", "1e3", and "1,0,0".
const GHS_SHAPE = /^(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/;

/** Parse a user-entered GHS string to integer pesewas; null if invalid. */
export function parseGHSToPesewas(input: string): number | null {
  const trimmed = input.trim();
  if (!GHS_SHAPE.test(trimmed)) return null;
  const value = Number(trimmed.replace(/,/g, ""));
  if (value <= 0) return null;
  return Math.round(value * 100);
}
