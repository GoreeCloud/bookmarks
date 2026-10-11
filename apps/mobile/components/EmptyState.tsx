import React from "react";
import {
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  /** Whether to render the message. Hidden e.g. while still fetching. */
  showMessage?: boolean;
  message?: string;
  refreshControl?: ScrollViewProps["refreshControl"];
};

/**
 * Empty-state for the list screens. A full-window ScrollView keeps pull-to-refresh
 * working, with the message centered via an absolute overlay.
 *
 * The overlay is used (instead of flexGrow/centerContent) because on iOS the
 * transparent large-title header makes the scroll container full-window and the
 * header inset is invisible to JS, so layout-based centering fails/races on cold
 * start. On Android the header is opaque, so the overlay instead fills down behind
 * the bottom system inset and the message lands slightly low — pad it back up.
 */
export default function EmptyState({
  showMessage = true,
  message = "Nothing found...",
  refreshControl,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ flexGrow: 1 }}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      />
      {showMessage && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              justifyContent: "center",
              alignItems: "center",
              paddingBottom: Platform.OS === "android" ? insets.bottom : 0,
            },
          ]}
        >
          <Text className="text-center text-xl text-neutral">{message}</Text>
        </View>
      )}
    </View>
  );
}
