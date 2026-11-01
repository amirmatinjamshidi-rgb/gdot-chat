import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DEV__: false,
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    setupFiles: ["lib/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "react-native": path.resolve(__dirname, "lib/test/react-native-stub.ts"),
      "expo-crypto": path.resolve(__dirname, "lib/test/expo-crypto-stub.ts"),
      "expo-constants": path.resolve(__dirname, "lib/test/expo-constants-stub.ts"),
      "expo-secure-store": path.resolve(__dirname, "lib/test/expo-secure-store-stub.ts"),
      "@react-native-async-storage/async-storage": path.resolve(
        __dirname,
        "lib/test/async-storage-stub.ts",
      ),
    },
  },
});
