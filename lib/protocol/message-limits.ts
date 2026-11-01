/**
 * Product plaintext limit for chat text messages (UTF-16 code units /
 * JavaScript string length), enforced on the client before Signal encrypt.
 *
 * Server cannot see plaintext; it instead caps ciphertext size via
 * Relay:MaxCiphertextBytes (64 KiB) derived from this limit:
 * 10_000 chars × 4 UTF-8 bytes + JSON wrapper + Signal overhead.
 */
export const MAX_MESSAGE_TEXT_CHARS = 10_000;

export const MESSAGE_TOO_LONG_ERROR =
  "Message is too long (max 10,000 characters).";

/** Throws {@link MESSAGE_TOO_LONG_ERROR} when `text` exceeds the product limit. */
export function assertMessageTextWithinLimit(text: string): void {
  if (text.length > MAX_MESSAGE_TEXT_CHARS) {
    throw new Error(MESSAGE_TOO_LONG_ERROR);
  }
}
