import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

export type PhonePickerCountry = {
  iso: CountryCode;
  callingCode: string;
  name: string;
  flag: string;
};

function toFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

let cached: PhonePickerCountry[] | null = null;

/** Sorted by localized country name; safe to call repeatedly (memoized). */
export function getAllPhonePickerCountries(): PhonePickerCountry[] {
  if (cached) return cached;
  let regionNames: Intl.DisplayNames;
  try {
    regionNames = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    cached = getCountries().map((iso) => ({
      iso,
      callingCode: getCountryCallingCode(iso),
      name: iso,
      flag: toFlagEmoji(iso),
    }));
    cached.sort((a, b) => a.name.localeCompare(b.name));
    return cached;
  }

  const rows: PhonePickerCountry[] = getCountries().map((iso) => ({
    iso,
    callingCode: getCountryCallingCode(iso),
    name: regionNames.of(iso) ?? iso,
    flag: toFlagEmoji(iso),
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  cached = rows;
  return cached;
}

/**
 * Match on country name, ISO code, or calling code (with or without leading +).
 */
export function filterPhonePickerCountries(
  rows: PhonePickerCountry[],
  query: string,
): PhonePickerCountry[] {
  const raw = query.trim();
  if (!raw) return rows;

  const lower = raw.toLowerCase();
  const digits = raw.replace(/\D/g, "");

  return rows.filter((r) => {
    if (r.name.toLowerCase().includes(lower)) return true;
    if (r.iso.toLowerCase().includes(lower)) return true;
    if (digits && r.callingCode.startsWith(digits)) return true;
    if (lower.startsWith("+") && r.callingCode.startsWith(digits)) return true;
    return false;
  });
}
