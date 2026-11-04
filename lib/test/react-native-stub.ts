export const Platform = {
  OS: "ios",
  select: <T>(spec: { ios?: T; android?: T; web?: T; default?: T; native?: T }) =>
    spec.ios ?? spec.native ?? spec.default,
};

type AppStateStatus = "active" | "background" | "inactive" | "unknown" | "extension";

export const AppState = {
  currentState: "active" as AppStateStatus,
  addEventListener: (
    _type: "change",
    _listener: (state: AppStateStatus) => void,
  ) => ({ remove: () => {} }),
};

export const Dimensions = {
  get: (_dim: "window" | "screen") => ({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  }),
  addEventListener: () => ({ remove: () => {} }),
};

export const PixelRatio = {
  get: () => 3,
  getFontScale: () => 1,
  getPixelSizeForLayoutSize: (size: number) => Math.round(size * 3),
  roundToNearestPixel: (size: number) => size,
};

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T) => styles,
  flatten: (style: unknown) => style,
  absoluteFillObject: {
    position: "absolute" as const,
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
};

export const View = "View";
export const Text = "Text";
export const TextInput = "TextInput";
export const Pressable = "Pressable";
export const ActivityIndicator = "ActivityIndicator";
export const FlatList = "FlatList";
export const ScrollView = "ScrollView";
export const KeyboardAvoidingView = "KeyboardAvoidingView";
export const Alert = { alert: () => {} };
