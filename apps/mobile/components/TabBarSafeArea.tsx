import { ReactNode } from "react";
import { Platform } from "react-native";
import { SafeAreaView } from "react-native-screens/experimental";

// SDK 54's native tabs don't inset screen content above the tab bar on Android
// (iOS handles it via contentInsetAdjustmentBehavior). expo-router 55 fixes this
// upstream with this exact wrapper — remove this component when upgrading to
// SDK 55, or content gets double-inset. https://github.com/expo/expo/pull/41295
export default function TabBarSafeArea({ children }: { children: ReactNode }) {
  if (Platform.OS !== "android") return <>{children}</>;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={{ bottom: true }}>
      {children}
    </SafeAreaView>
  );
}
