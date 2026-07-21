/**
 * Real Israeli locality search for registration/profile city fields —
 * cities, towns, local/regional council villages, kibbutzim, and moshavim.
 *
 * Data source: the `israel-geolocation` npm package (MIT), which sources
 * from Israel's official government open-data portal (data.gov.il) plus
 * OpenStreetMap/Google Maps for coordinates — 1,264 of Israel's 1,289
 * official settlements (98% coverage; see its README for the excluded
 * categories). Package version pinned in package.json; bump deliberately if
 * the upstream data set changes materially.
 *
 * English names are the CBS's official transliteration, which sometimes
 * differs from common colloquial spelling (e.g. "KEFAR SAVA", not "Kfar
 * Saba") — normalizeForSearch() covers the single most frequent case
 * (kfar/kefar) since it accounts for ~70 dataset entries, but this is not a
 * general fuzzy-match/phonetic engine. Any residual spelling mismatch a user
 * hits is exactly what the "no match found — use what you typed as a custom
 * location" fallback in LocalitySearchInput exists for.
 */
import { locations } from "israel-geolocation";

export type Locality = {
  localityId: string;
  nameHe: string;
  /** Title-cased for display — the package's own nameEn is upper-case ("TEL AVIV - YAFO"). */
  nameEn: string;
};

const ALL_LOCALITIES: Locality[] = locations
  .filter((l) => l.name && l.nameEn)
  .map((l) => ({
    localityId: String(l.id),
    nameHe: l.name as string,
    nameEn: toTitleCase(l.nameEn as string),
  }));

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeForSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/\s+/g, " ")
    .replace(/\bkfar\b/g, "kefar"); // most common EN transliteration mismatch
}

export function localityById(id: string): Locality | undefined {
  return ALL_LOCALITIES.find((l) => l.localityId === id);
}

/** Substring match against both Hebrew and English names, capped so the dropdown never renders an unbounded list. */
export function searchLocalities(rawQuery: string, limit = 8): Locality[] {
  const query = normalizeForSearch(rawQuery);
  if (!query) return [];
  const matches = ALL_LOCALITIES.filter((l) => {
    const en = normalizeForSearch(l.nameEn);
    const he = l.nameHe; // Hebrew has no meaningful diacritics/case to normalize here; direct substring is enough
    return en.includes(query) || he.includes(rawQuery.trim());
  });
  // Localities whose name *starts with* the query rank above ones that merely contain it.
  matches.sort((a, b) => {
    const aStarts = normalizeForSearch(a.nameEn).startsWith(query) ? 0 : 1;
    const bStarts = normalizeForSearch(b.nameEn).startsWith(query) ? 0 : 1;
    return aStarts - bStarts || a.nameEn.localeCompare(b.nameEn);
  });
  return matches.slice(0, limit);
}
