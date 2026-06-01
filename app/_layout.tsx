import { ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";

<<<<<<< HEAD
import { useColorScheme } from "@/hooks/use-color-scheme";
import { AppLockProvider } from "@/lib/providers/app-lock-provider";
import { AuthProvider } from "@/lib/providers/auth-provider";
import { SyncProvider } from "@/lib/providers/sync-provider";
import { AppServicesProvider } from "@/lib/services/app-services-context";
=======
import { ThemePaletteProvider, useThemePalette } from "@/providers/theme-palette-provider";
import { AuthProvider } from "@/providers/auth-provider";
>>>>>>> 8a3a64b08492dd743e451fcadf379ca5ae2fbb2c

export const unstable_settings = {
  initialRouteName: "index",
};

function RootNavigation() {
  const { navigationTheme, mode, colors } = useThemePalette();

  return (
<<<<<<< HEAD
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
=======
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
>>>>>>> 8a3a64b08492dd743e451fcadf379ca5ae2fbb2c
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemePaletteProvider>
        <AuthProvider>
          <RootNavigation />
        </AuthProvider>
      </ThemePaletteProvider>
    </GestureHandlerRootView>
  );
}
