import { parsePhoneNumberFromString } from "libphonenumber-js";
import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
});

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
export type OtpInput = z.infer<typeof otpSchema>;
