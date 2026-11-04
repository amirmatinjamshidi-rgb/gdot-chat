/** Post-key PRAGMA statements applied on every SQLCipher open (order matters). */
export function sqlcipherPostKeyPragmas(busyTimeoutMs: number): readonly string[] {
  return [
    "PRAGMA foreign_keys = ON",
    "PRAGMA cipher_memory_security = ON",
    "PRAGMA secure_delete = ON",
    `PRAGMA busy_timeout = ${busyTimeoutMs}`,
  ] as const;
}
