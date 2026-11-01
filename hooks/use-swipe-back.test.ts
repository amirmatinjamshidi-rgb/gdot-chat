import { beforeEach, describe, expect, it, vi } from "vitest";

const onEndHandlers: Array<(e: { translationX: number }) => void> = [];
let lastEnabled: boolean | undefined;

vi.mock("expo-router", () => ({
  useRouter: () => ({ back: vi.fn() }),
}));

vi.mock("react-native-gesture-handler", () => ({
  Gesture: {
    Pan: () => {
      const chain = {
        enabled: (v: boolean) => {
          lastEnabled = v;
          return chain;
        },
        activeOffsetX: () => chain,
        failOffsetY: () => chain,
        onEnd: (fn: (e: { translationX: number }) => void) => {
          onEndHandlers.push(fn);
          return chain;
        },
      };
      return chain;
    },
  },
}));

vi.mock("react-native-reanimated", () => ({
  runOnJS: (fn: (...args: unknown[]) => void) => fn,
}));

describe("createSwipeBackGesture", () => {
  beforeEach(() => {
    onEndHandlers.length = 0;
    lastEnabled = undefined;
  });

  it("calls back when translation crosses threshold", async () => {
    const back = vi.fn();
    const { createSwipeBackGesture, SWIPE_BACK_TRANSLATION_X } = await import(
      "@/hooks/use-swipe-back"
    );
    createSwipeBackGesture(back, true);
    expect(lastEnabled).toBe(true);
    onEndHandlers.at(-1)!({ translationX: SWIPE_BACK_TRANSLATION_X - 1 });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("ignores short swipes", async () => {
    const back = vi.fn();
    const { createSwipeBackGesture } = await import("@/hooks/use-swipe-back");
    createSwipeBackGesture(back, true);
    onEndHandlers.at(-1)!({ translationX: -20 });
    expect(back).not.toHaveBeenCalled();
  });

  it("can be disabled", async () => {
    const back = vi.fn();
    const { createSwipeBackGesture } = await import("@/hooks/use-swipe-back");
    createSwipeBackGesture(back, false);
    expect(lastEnabled).toBe(false);
  });
});
