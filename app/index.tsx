import { type Href, Redirect } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { useAppServices } from "@/lib/services/app-services-context";

export default function Index() {
  const { authStore } = useAppServices();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    void authStore.isLoggedIn().then((loggedIn) => {
      setTarget(loggedIn ? "/lock" : "/(auth)/login");
    });
  }, [authStore]);

  if (!target) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Redirect href={target as Href} />;
}
