import {
  getCountries,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { z } from "zod";

const VALID_PHONE_REGIONS = new Set<string>(getCountries());

export const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

/** Country region (ISO) from the picker + national number (formatted). */
export const phonePartsSchema = z
  .object({
    countryIso: z.string(),
    nationalNumber: z.string(),
  })
  .superRefine((data, ctx) => {
    if (!data.countryIso || !VALID_PHONE_REGIONS.has(data.countryIso)) {
      ctx.addIssue({
        code: "custom",
        message: "Select your country",
        path: ["countryIso"],
      });
      return;
    }

    const country = data.countryIso as CountryCode;
    const nationalDigits = data.nationalNumber.replace(/\D/g, "");

    if (!nationalDigits) {
      ctx.addIssue({
        code: "custom",
        message: "Enter phone number",
        path: ["nationalNumber"],
      });
      return;
    }

    const parsed = parsePhoneNumberFromString(nationalDigits, country);
    if (!parsed?.isValid()) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid phone number",
        path: ["nationalNumber"],
      });
    }
  });

/** @deprecated Prefer phonePartsSchema — kept for any external imports */
export const phoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(4, "Enter phone number")
    .refine((value) => {
      const parsed = parsePhoneNumberFromString(value);
      return Boolean(parsed?.isValid());
    }, "Enter a valid phone number"),
});

export const otpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

export type EmailInput = z.infer<typeof emailSchema>;
export type PhoneInput = z.infer<typeof phoneSchema>;
export type PhonePartsInput = z.infer<typeof phonePartsSchema>;
export type OtpInput = z.infer<typeof otpSchema>;
