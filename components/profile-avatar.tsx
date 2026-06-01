import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";

type ProfileAvatarProps = {
  initials: string;
  source?: ImageSourcePropType;
  size?: number;
};

export function ProfileAvatar({
  initials,
  source,
  size = 86,
}: ProfileAvatarProps) {
  const dim = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.avatar, dim]}>
      {source ? (
        <Image source={source} style={[styles.image, dim]} resizeMode="cover" />
      ) : (
        <ThemedText
          style={[styles.initials, { fontSize: size * 0.34 }]}
          lightColor="#FFFFFF"
        >
          {initials}
        </ThemedText>
      )}
      <View style={styles.statusDot} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    overflow: "hidden",
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3B82F6",
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  initials: {
    fontWeight: "800",
    letterSpacing: 1,
  },
  statusDot: {
    position: "absolute",
    right: 6,
    bottom: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    backgroundColor: "#22C55E",
  },
});
