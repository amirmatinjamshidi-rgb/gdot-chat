export const DB_NAME = "gdot.db";
export const SECURE_STORE_KEK_KEY = "gdot.db.kek";
/** biometric | pin — chosen once at first KEK creation. */
export const SECURE_STORE_KEK_MODE_KEY = "gdot.db.kek.mode";
/**
 * Non-auth marker that a biometric KEK exists. Presence checks must use this
 * (or the mode key) — never decrypt {@link SECURE_STORE_KEK_KEY} just to probe.
 */
export const SECURE_STORE_KEK_PRESENT_KEY = "gdot.db.kek.present";
/** JSON PinWrappedKek when mode is pin (no requireAuthentication). */
export const SECURE_STORE_PIN_WRAPPED_KEK_KEY = "gdot.db.kek.pin";
export const MIGRATIONS_TABLE = "schema_migrations";
export const SECURE_STORE_PIN_LOCKOUT_KEY = "gdot.db.pin.lockout";
