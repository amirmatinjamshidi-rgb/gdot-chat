export const DB_NAME = "gdot.db";
export const SECURE_STORE_KEK_KEY = "gdot.db.kek";
/** biometric | pin — chosen once at first KEK creation. */
export const SECURE_STORE_KEK_MODE_KEY = "gdot.db.kek.mode";
/** JSON PinWrappedKek when mode is pin (no requireAuthentication). */
export const SECURE_STORE_PIN_WRAPPED_KEK_KEY = "gdot.db.kek.pin";
export const MIGRATIONS_TABLE = "schema_migrations";
