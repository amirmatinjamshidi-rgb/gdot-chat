import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useMemo } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

import { buildNavigationTheme } from "@/constants/theme";
import { AppLockProvider } from "@/lib/providers/app-lock-provider";
import { AuthProvider } from "@/lib/providers/auth-provider";
import { SyncProvider } from "@/lib/providers/sync-provider";
import { AppServicesProvider } from "@/lib/services/app-services-context";
import { useColors, useThemeStore } from "@/stores/theme-store";
import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  initialRouteName: "index",
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
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="lock" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="verify-otp" options={{ headerShown: false }} />
        <Stack.Screen name="ChatRoom" options={{ title: "Chat" }} />
        <Stack.Screen name="add-contact" options={{ title: "Add contact" }} />
        <Stack.Screen name="edit-profile" options={{ title: "Edit profile" }} />
        <Stack.Screen name="CreateGroup" options={{ title: "Create Group" }} />
        <Stack.Screen
          name="safety-number"
          options={{ title: "Safety number" }}
        />
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

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeInitializer>
        <AppServicesProvider>
          <AuthProvider>
            <AppLockProvider>
              <SyncProvider>
                <RootNavigation />
              </SyncProvider>
            </AppLockProvider>
          </AuthProvider>
        </AppServicesProvider>
      </ThemeInitializer>
    </GestureHandlerRootView>
  );
}
