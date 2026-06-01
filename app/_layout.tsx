import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppLockProvider } from "@/lib/providers/app-lock-provider";
import { AuthProvider } from "@/lib/providers/auth-provider";
import { SyncProvider } from "@/lib/providers/sync-provider";
import { AppServicesProvider } from "@/lib/services/app-services-context";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AppServicesProvider>
      <AuthProvider>
        <AppLockProvider>
          <SyncProvider>
            <ThemeProvider
              value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
            >
              <Stack
                screenOptions={{
                  animation:
                    Platform.OS === "web" ? "fade" : "slide_from_right",
                  fullScreenGestureEnabled: true,
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="lock" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="ChatRoom" options={{ title: "Chat" }} />
                <Stack.Screen name="Contacts" options={{ title: "Contacts" }} />
                <Stack.Screen
                  name="CreateGroup"
                  options={{ title: "Create Group" }}
                />
                <Stack.Screen
                  name="safety-number"
                  options={{ title: "Safety number" }}
                />
                <Stack.Screen
                  name="modal"
                  options={{
                    presentation: "modal",
                    title: "Modal",
                    animation: "fade_from_bottom",
                  }}
                />
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </SyncProvider>
        </AppLockProvider>
      </AuthProvider>
    </AppServicesProvider>
  );
}
