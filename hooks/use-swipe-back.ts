import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

/** Shared edge swipe-back used by 1:1 and group chat rooms. */
export function useSwipeBackGesture(enabled = true) {
  const router = useRouter();
  return useMemo(
    () =>
      Gesture.Pan()
        .enabled(enabled)
        .activeOffsetX(-14)
        .failOffsetY([-40, 40])
        .onEnd((e) => {
          if (e.translationX < -88) {
            runOnJS(router.back)();
          }
        }),
    [router, enabled],
  );
}
