import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

/** Horizontal translation (px) required to trigger back. */
export const SWIPE_BACK_TRANSLATION_X = -88;

type BackFn = () => void;

/** Pure factory — used by the hook and unit-tested with a mock back fn. */
export function createSwipeBackGesture(back: BackFn, enabled = true) {
  return Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(-14)
    .failOffsetY([-40, 40])
    .onEnd((e) => {
      if (e.translationX < SWIPE_BACK_TRANSLATION_X) {
        runOnJS(back)();
      }
    });
}

/** Shared edge swipe-back used by 1:1 and group chat rooms. */
export function useSwipeBackGesture(enabled = true) {
  const router = useRouter();
  return useMemo(
    () => createSwipeBackGesture(() => router.back(), enabled),
    [router, enabled],
  );
}
