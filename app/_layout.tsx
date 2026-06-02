import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { ThemePaletteProvider, useThemePalette } from "@/providers/theme-palette-provider";
import { useAuthStore } from "@/stores/auth-store";

export const unstable_settings = {
  anchor: "(tabs)",
};

function RootNavigation() {
  const { navigationTheme, mode, colors } = useThemePalette();

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack
        screenOptions={{
          animation: Platform.OS === "web" ? "fade" : "slide_from_right",
          fullScreenGestureEnabled: true,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="verify-otp" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="ChatRoom" options={{ title: "Chat" }} />
        <Stack.Screen name="Contacts" options={{ title: "Contacts" }} />
        <Stack.Screen name="CreateGroup" options={{ title: "Create Group" }} />
        <Stack.Screen name="profile-themes" options={{ title: "Themes" }} />
        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            title: "Modal",
            animation: "fade_from_bottom",
          }}
        />
      </Stack>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
    </ThemeProvider>
  );
}

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePaletteProvider>
        <AuthInitializer>
          <RootNavigation />
        </AuthInitializer>
      </ThemePaletteProvider>
    </GestureHandlerRootView>
  );
}
