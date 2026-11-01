/** @type {import("jest").Config} */
process.env.EXPO_PUBLIC_API_URL =
  process.env.EXPO_PUBLIC_API_URL || "http://127.0.0.1:5066/v1";

module.exports = {
  preset: "jest-expo",
  testMatch: ["**/__tests__/ui/**/*.test.tsx", "**/__tests__/hooks/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/__tests__/ui/setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testTimeout: 20000,
  clearMocks: true,
  transformIgnorePatterns: [
    "/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|@noble|@borewit|zustand))",
    "/node_modules/react-native-reanimated/plugin/",
  ],
};

