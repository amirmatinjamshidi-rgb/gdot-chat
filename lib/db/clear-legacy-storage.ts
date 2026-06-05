import AsyncStorage from "@react-native-async-storage/async-storage";

const LEGACY_KEYS = [
  "gdot_profile_prefs_v1",
  "gdot_input_store_v1",
  "gdot_messages_store_v1",
  "smash_media_prefs_v1",
  "messages-storage",
  "input-storage",
];

/** One-time cleanup of plaintext persisted before SQLCipher migration. */
export async function clearLegacyAsyncStorage(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const toRemove = allKeys.filter(
      (k) =>
        LEGACY_KEYS.includes(k) ||
        k.startsWith("gdot_messages") ||
        k.startsWith("gdot_input"),
    );
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove);
    }
  } catch {
    // Non-fatal on first launch
  }
}
