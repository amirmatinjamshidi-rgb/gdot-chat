import { requireNativeViewManager } from "expo-modules-core";
import React, { useCallback, useRef } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export type EncryptedVideoProps = {
  attachmentId: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: "cover" | "contain";
  nativeControls?: boolean;
  playing?: boolean;
  onProgress?: (e: {
    nativeEvent: { currentTime: number; duration: number; playing: boolean };
  }) => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
};

type NativeRef = {
  play?: () => Promise<void>;
  pause?: () => Promise<void>;
  seekTo?: (seconds: number) => Promise<void>;
  getStatus?: () => Promise<{
    currentTime: number;
    duration: number;
    playing: boolean;
  }>;
};

type NativeViewProps = {
  attachmentId: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: "cover" | "contain";
  nativeControls?: boolean;
  playing?: boolean;
  onProgress?: EncryptedVideoProps["onProgress"];
  onEnd?: () => void;
  onError?: (e: { nativeEvent: { message?: string } }) => void;
};

const NativeEncryptedVideo = (
  Platform.OS === "web"
    ? View
    : requireNativeViewManager("GdotEncryptedMedia")
) as unknown as React.ComponentType<
  NativeViewProps & { ref?: React.Ref<NativeRef | null> }
>;

export const EncryptedVideo = React.forwardRef<NativeRef, EncryptedVideoProps>(
  function EncryptedVideo(props, ref) {
    const {
      attachmentId,
      style,
      contentFit = "cover",
      nativeControls = false,
      playing,
      onProgress,
      onEnd,
      onError,
    } = props;
    const viewRef = useRef<NativeRef | null>(null);

    React.useImperativeHandle(ref, () => ({
      play: () => viewRef.current?.play?.() ?? Promise.resolve(),
      pause: () => viewRef.current?.pause?.() ?? Promise.resolve(),
      seekTo: (s: number) => viewRef.current?.seekTo?.(s) ?? Promise.resolve(),
      getStatus: () =>
        viewRef.current?.getStatus?.() ??
        Promise.resolve({ currentTime: 0, duration: 0, playing: false }),
    }));

    const handleError = useCallback(
      (e: { nativeEvent: { message?: string } }) => {
        onError?.(e.nativeEvent?.message ?? "playback error");
      },
      [onError],
    );

    if (Platform.OS === "web") {
      return <View style={[styles.fallback, style]} />;
    }

    return (
      <NativeEncryptedVideo
        ref={viewRef}
        attachmentId={attachmentId}
        contentFit={contentFit}
        nativeControls={nativeControls}
        playing={playing}
        onProgress={onProgress}
        onEnd={onEnd}
        onError={handleError}
        style={style}
      />
    );
  },
);

const styles = StyleSheet.create({
  fallback: { backgroundColor: "#000" },
});
