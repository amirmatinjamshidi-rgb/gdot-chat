

jest.mock("@/components/voice-message-bubble", () => {
  const React = require("react");
  return {
    VoiceMessageBubble: (props: Record<string, unknown>) =>
      React.createElement("VoiceMessageBubble", props),
  };
});

jest.mock("@/components/video-message-bubble", () => {
  const React = require("react");
  return {
    VIDEO_BUBBLE_SIZE: 120,
    VIDEO_BUBBLE_PLAY_SCALE: 1.2,
    VideoMessageBubble: (props: Record<string, unknown>) =>
      React.createElement("VideoMessageBubble", props),
  };
});

jest.mock("@/components/video-message", () => {
  const React = require("react");
  return {
    VideoMessage: React.forwardRef((_props: unknown, _ref: unknown) => null),
  };
});

jest.mock("expo-video", () => {
  const React = require("react");
  return {
    useVideoPlayer: () => ({
      play: jest.fn(),
      pause: jest.fn(),
      replace: jest.fn(),
    }),
    VideoView: (props: Record<string, unknown>) =>
      React.createElement("VideoView", props),
  };
});

jest.mock("expo-camera", () => {
  const React = require("react");
  return {
    CameraView: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement("CameraView", { ...props, ref }),
    ),
    useCameraPermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
    useMicrophonePermissions: () => [{ granted: true }, jest.fn(async () => ({ granted: true }))],
  };
});

jest.mock("expo-audio", () => {
  const recorder = {
    isRecording: false,
    uri: null as string | null,
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(async () => {
      recorder.isRecording = true;
      recorder.uri = "file:///mock-voice.m4a";
    }),
    stop: jest.fn(async () => {
      recorder.isRecording = false;
    }),
  };
  return {
    RecordingPresets: { HIGH_QUALITY: {} },
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
    setAudioModeAsync: jest.fn(async () => undefined),
    useAudioRecorder: () => recorder,
  };
});

jest.mock("@/lib/services/app-services", () => ({
  appServices: {},
}));


jest.mock("@/lib/crypto/pin-kek", () => ({
  APP_PIN_MIN_LENGTH: 8,
  APP_PIN_MAX_LENGTH: 128,
  validateAppPin: (pin: string) => {
    if (pin.length < 8) {
      const { AppAuthError } = require("@/lib/auth/app-auth-error");
      throw new AppAuthError(
        "PIN_INVALID",
        "App PIN must be at least 8 characters",
      );
    }
  },
}));


// Matchers come from any @testing-library/react-native import in tests.

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-linear-gradient", () => {
  const React = require("react");
  return {
    LinearGradient: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("LinearGradient", props, children),
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: {
    Success: "success",
    Error: "error",
    Warning: "warning",
  },
}));

jest.mock("expo-router", () => {
  const React = require("react");
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
  };
  return {
    useRouter: () => router,
    useLocalSearchParams: jest.fn(() => ({})),
    usePathname: jest.fn(() => "/"),
    useSegments: jest.fn(() => []),
    Link: ({ children }: { children: React.ReactNode }) => children,
    Stack: { Screen: () => null },
    router,
  };
});

jest.mock("@react-navigation/native", () => {
  const actual = jest.requireActual("@react-navigation/native");
  return {
    ...actual,
    useFocusEffect: (cb: () => void | (() => void)) => {
      const React = require("react");
      React.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === "function" ? cleanup : undefined;
      }, [cb]);
    },
  };
});

jest.mock("@shopify/flash-list", () => {
  const React = require("react");
  const { FlatList } = require("react-native");
  return {
    FlashList: React.forwardRef((props: object, ref: unknown) =>
      React.createElement(FlatList, { ...props, ref }),
    ),
  };
});

jest.mock("react-native-reanimated", () => {
  const Reanimated = require("react-native-reanimated/mock");
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock("react-native-safe-area-context", () => {
  const React = require("react");
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode }) =>
      React.createElement("SafeAreaView", props, children),
    useSafeAreaInsets: () => inset,
  };
});

jest.mock("@expo/vector-icons/MaterialIcons", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) =>
      React.createElement("MaterialIcons", props),
  };
});

jest.mock("@expo/vector-icons", () => {
  const React = require("react");
  const Icon = (props: Record<string, unknown>) =>
    React.createElement("ExpoIcon", props);
  return {
    Ionicons: Icon,
    MaterialIcons: Icon,
    AntDesign: Icon,
  };
});

jest.mock("expo-symbols", () => ({
  SymbolView: () => null,
}));


jest.mock("@/lib/providers/app-lock-provider", () => {
  const React = require("react");
  return {
    AppLockProvider: ({ children }: { children: React.ReactNode }) => children,
    useAppLock: () => ({
      isUnlocked: true,
      dbReady: true,
      lockEpoch: 0,
      unlock: jest.fn(async () => ({ ok: true })),
      lock: jest.fn(),
      beginSuppressBackgroundLock: jest.fn(),
      endSuppressBackgroundLock: jest.fn(),
    }),
  };
});

beforeEach(() => {
  jest.useFakeTimers({ advanceTimers: true });
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});
