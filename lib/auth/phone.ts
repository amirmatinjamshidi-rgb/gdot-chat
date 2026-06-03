import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export type PhoneCountryInfo = {
  countryCode: string;
  name: string;
  callingCode: string | null;
  flag: string;
};

const MAX_CALLING_CODE_DIGITS = 4;

function toFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0)),
    );
}

/** Digits only for the country calling code field (no leading +). */
export function sanitizeCallingCodeDigits(input: string): string {
  return input.replace(/\D/g, "").slice(0, MAX_CALLING_CODE_DIGITS);
}

/**
 * True when the typed digits fully identify a calling code for UX auto-advance.
 * NANP (+1) is special: many countries share "1" but longer codes like +1242 exist,
 * so we still advance on "1" so US/CA users are not blocked.
 */
export function shouldAdvanceToNationalNumber(digits: string): boolean {
  const d = sanitizeCallingCodeDigits(digits);
  if (!d) return false;

  const exactMatch = getCountries().filter(
    (c) => getCountryCallingCode(c) === d,
  );
  const couldGrowLonger = getCountries().some((c) => {
    const cc = getCountryCallingCode(c);
    return cc.startsWith(d) && cc.length > d.length;
  });

  if (d === "1" && exactMatch.length > 0) return true;
  if (exactMatch.length > 0 && !couldGrowLonger) return true;
  return false;
}

export function formatPhoneAsYouType(input: string): string {
  const clean = input.replace(/[^\d+\s()-]/g, "");
  return new AsYouType().input(clean);
}

export function normalizePhone(input: string): string {
  const parsed = parsePhoneNumberFromString(input);
  return parsed?.number ?? input.replace(/\s+/g, "");
}

export function getPhoneCountryInfo(input: string): PhoneCountryInfo | null {
  if (!input.startsWith("+")) return null;
  const helper = new AsYouType();
  helper.input(input);
  const countryCode = helper.getCountry();
  if (!countryCode) return null;

  let name: string = countryCode;
  try {
    const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    name = regionNames.of(countryCode) ?? countryCode;
  } catch {
    name = countryCode;
  }
  const callingCode = helper.getCallingCode() ?? null;

  return {
    countryCode,
    name,
    callingCode,
    flag: toFlagEmoji(countryCode),
  };
}

/** Resolve flag / name from calling-code digits only (after +). */
export function getCountryInfoFromCallingCodeDigits(
  digits: string,
): PhoneCountryInfo | null {
  const d = sanitizeCallingCodeDigits(digits);
  if (!d) return null;

  const helper = new AsYouType();
  helper.input(`+${d}`);
  const countryCode = helper.getCountry();
  if (!countryCode) return null;

  let name: string = countryCode;
  try {
    const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    name = regionNames.of(countryCode) ?? countryCode;
  } catch {
    name = countryCode;
  }
  const callingCode = helper.getCallingCode() ?? null;

  return {
    countryCode,
    name,
    callingCode,
    flag: toFlagEmoji(countryCode),
  };
}

/** Format the national portion while typing, for the selected country. */
export function formatNationalAsYouType(
  defaultCountry: string,
  rawInput: string,
): string {
  const digits = rawInput.replace(/\D/g, "");
  const ayt = new AsYouType(defaultCountry as CountryCode);
  let out = "";
  for (const ch of digits) {
    out = ayt.input(ch);
  }
  return out;
}

export function resolveCountryFromCallingDigits(
  digits: string,
): CountryCode | null {
  const d = sanitizeCallingCodeDigits(digits);
  if (!d) return null;
  const helper = new AsYouType();
  helper.input(`+${d}`);
  return (helper.getCountry() as CountryCode | undefined) ?? null;
}

/** E.164 string for OTP / API, or null if not yet parseable. */
export function buildE164FromParts(
  callingDigits: string,
  nationalFormatted: string,
): string | null {
  const d = sanitizeCallingCodeDigits(callingDigits);
  const nationalDigits = nationalFormatted.replace(/\D/g, "");
  if (!d || !nationalDigits) return null;

  const country = resolveCountryFromCallingDigits(d);
  if (!country) return null;

  const parsed = parsePhoneNumberFromString(nationalDigits, country);
  return parsed?.format("E.164") ?? null;
}

/** Prefer when the user picked an explicit region (e.g. shared NANP +1). */
export function buildE164FromCountryIso(
  country: CountryCode,
  nationalFormatted: string,
): string | null {
  const nationalDigits = nationalFormatted.replace(/\D/g, "");
  if (!nationalDigits) return null;
  const parsed = parsePhoneNumberFromString(nationalDigits, country);
  return parsed?.format("E.164") ?? null;
}

export function getPhoneCountryDisplayFromIso(
  iso: CountryCode,
): PhoneCountryInfo {
  const callingCode = getCountryCallingCode(iso);
  let name: string = iso;
  try {
    const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    name = regionNames.of(iso) ?? iso;
  } catch {
    name = iso;
  }
  return {
    countryCode: iso,
    name,
    callingCode,
    flag: toFlagEmoji(iso),
  };
}

export function normalizePhoneFromParts(
  callingDigits: string,
  nationalFormatted: string,
): string {
  return (
    buildE164FromParts(callingDigits, nationalFormatted) ??
    `+${sanitizeCallingCodeDigits(callingDigits)}${nationalFormatted.replace(/\D/g, "")}`
  );
}
