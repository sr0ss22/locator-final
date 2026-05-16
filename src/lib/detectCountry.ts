/**
 * Best-effort country detection from a postal code string.
 *
 * Used by the locator pages to auto-switch the app's isCanada toggle
 * after a search resolves, so the coverage overlay (which picks
 * US-zip vs Canada-FSA data sources based on isCanada) paints the
 * right polygons without the user having to flip the toggle by hand.
 *
 * Returns "Canada" if the input clearly looks like a Canadian postal
 * code (FSA pattern: letter-digit-letter), "USA" if it looks like a
 * US ZIP (5 digits, optionally + 4), or null if it's ambiguous /
 * empty (callers should leave the country setting unchanged in that
 * case).
 */
export function detectCountryFromPostalCode(
  postalCode: string | null | undefined,
): "USA" | "Canada" | null {
  if (!postalCode) return null;
  const trimmed = postalCode.trim().toUpperCase();
  if (/^[A-Z]\d[A-Z]/.test(trimmed)) return "Canada";
  if (/^\d{5}(-?\d{4})?$/.test(trimmed)) return "USA";
  return null;
}
