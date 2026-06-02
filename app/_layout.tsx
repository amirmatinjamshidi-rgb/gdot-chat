import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { buildNavigationTheme } from "@/constants/theme";
import { useThemeStore, useColors } from "@/stores/theme-store";
import { useAuthStore } from "@/stores/auth-store";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "(tabs)",
};

function ThemeInitializer({ children }: { children: React.ReactNode }) {
  const initializeTheme = useThemeStore((state) => state.initializeTheme);
  const setSystemMode = useThemeStore((state) => state.setSystemMode);
  const systemScheme = useColorScheme();

  useEffect(() => {
    void initializeTheme();
  }, [initializeTheme]);

  useEffect(() => {
    const mode: "light" | "dark" = systemScheme === "dark" ? "dark" : "light";
    setSystemMode(mode);
  }, [systemScheme, setSystemMode]);

  return <>{children}</>;
}

function RootNavigation() {
  const mode = useThemeStore((state) => state.mode);
  const colors = useColors();
  const navigationTheme = useMemo(
    () => buildNavigationTheme(mode, colors),
    [mode, colors],
  );

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
      <ThemeInitializer>
        <AuthInitializer>
          <RootNavigation />
        </AuthInitializer>
      </ThemeInitializer>
    </GestureHandlerRootView>
  );
}
