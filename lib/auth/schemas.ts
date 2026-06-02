import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { z } from "zod";

import {
  resolveCountryFromCallingDigits,
  sanitizeCallingCodeDigits,
} from "@/lib/auth/phone";

export const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

/** Split: country calling code digits (no +) + national number (formatted). */
export const phonePartsSchema = z
  .object({
    callingCodeDigits: z.string(),
    nationalNumber: z.string(),
  })
  .superRefine((data, ctx) => {
    const calling = sanitizeCallingCodeDigits(data.callingCodeDigits);
    const nationalDigits = data.nationalNumber.replace(/\D/g, "");

    if (!calling) {
      ctx.addIssue({
        code: "custom",
        message: "Enter country code",
        path: ["callingCodeDigits"],
      });
      return;
    }

    const country = resolveCountryFromCallingDigits(calling);
    if (!country) {
      ctx.addIssue({
        code: "custom",
        message: "Unknown country code",
        path: ["callingCodeDigits"],
      });
      return;
    }

    if (!nationalDigits) {
      ctx.addIssue({
        code: "custom",
        message: "Enter phone number",
        path: ["nationalNumber"],
      });
      return;
    }

    const parsed = parsePhoneNumberFromString(
      nationalDigits,
      country as CountryCode,
    );
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
