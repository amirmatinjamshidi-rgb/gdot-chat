import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import type {
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from "@react-navigation/material-top-tabs";
import type { ParamListBase, TabNavigationState } from "@react-navigation/native";
import { Redirect, withLayoutContext } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { SwipeTabBar } from "@/components/swipe-tab-bar";
import { useAuth } from "@/lib/providers/auth-provider";
import { useColors, useLegacyColors } from "@/stores/theme-store";

const { Navigator } = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Navigator);

export default function TabLayout() {
  const legacyColors = useLegacyColors();
  const colors = useColors();
  const { isLoading, isLoggedIn } = useAuth();

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  if (!isLoggedIn) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <MaterialTopTabs
      tabBarPosition="bottom"
      tabBar={(props) => <SwipeTabBar {...props} />}
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true,
        tabBarActiveTintColor: legacyColors.tabIconSelected,
        tabBarInactiveTintColor: legacyColors.tabIconDefault,
        lazy: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <MaterialTopTabs.Screen
        name="contacts"
        options={{ title: "Contacts", tabBarLabel: "Contacts" }}
      />
      <MaterialTopTabs.Screen
        name="chats"
        options={{ title: "Chats", tabBarLabel: "Chats" }}
      />
      <MaterialTopTabs.Screen
        name="profile"
        options={{ title: "Profile", tabBarLabel: "Profile" }}
      />
      <MaterialTopTabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarLabel: "Settings" }}
      />
    </MaterialTopTabs>
  );
}
