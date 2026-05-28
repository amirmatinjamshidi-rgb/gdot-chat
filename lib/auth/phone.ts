import { AsYouType, parsePhoneNumberFromString } from "libphonenumber-js";

export type PhoneCountryInfo = {
  countryCode: string;
  name: string;
  callingCode: string | null;
  flag: string;
};

function toFlagEmoji(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) =>
      String.fromCodePoint(127397 + char.charCodeAt(0)),
    );
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
