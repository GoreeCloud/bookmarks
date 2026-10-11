import { Alert, Linking } from "react-native";

const cleanInstance = (instance?: string | null) =>
  (instance || "").trim().replace(/\/+$/, "");

const timeout = (ms: number) =>
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("TIMEOUT")), ms)
  );

export const isServerReachable = async (
  instance?: string | null,
  ms = 30000
) => {
  const nextInstance = cleanInstance(instance);

  if (nextInstance !== "https://cloud.linkwarden.app") return true;

  try {
    const res = await Promise.race([
      fetch(`${nextInstance}/api/v1/config`),
      timeout(ms),
    ]);

    return res.ok;
  } catch {
    return false;
  }
};

export const ensureCloudIsReachable = async (instance?: string | null) => {
  const reachable = await isServerReachable(instance);

  if (!reachable) {
    Alert.alert(
      "Service temporarily unavailable",

      "We can’t reach our servers right now. This may be due to scheduled maintenance or a temporary outage. Please check your connection and try again soon.",

      [
        {
          text: "Contact Support",

          onPress: () => {
            const subject = encodeURIComponent("App connection issue");

            const body = encodeURIComponent(
              "Hi, I'm having trouble connecting to the app. It says the server is unavailable or under maintenance. Can you help?"
            );

            Linking.openURL(
              `mailto:support@linkwarden.app?subject=${subject}&body=${body}`
            );
          },
        },

        {
          text: "Close",
        },
      ],

      { cancelable: true }
    );
  }

  return reachable;
};
