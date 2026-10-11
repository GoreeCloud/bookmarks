import {
  BookOpen,
  Highlighter,
  Info,
  WifiOff,
  type LucideIcon,
} from "lucide-react-native";
import { SheetManager } from "react-native-actions-sheet";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Bump this whenever you want the "What's New" sheet to be shown again.
 *
 * It is intentionally decoupled from the app binary version (app.config.ts) so
 * that patch/minor releases without anything to announce don't re-trigger the
 * sheet. Set it to the release that introduces the features listed below.
 *
 * How the "show once" logic works:
 *  - The last version a user has seen is stored in `data.lastSeenWhatsNew`.
 *  - Existing users keep their session token across app updates and land
 *    straight on the dashboard, where the sheet is shown because their stored
 *    value (null) !== WHATS_NEW_VERSION.
 *  - Brand-new users go through login/sign-up, which seeds `lastSeenWhatsNew`
 *    to the current version (see store/auth.ts) so they don't see it.
 */
export const WHATS_NEW_VERSION = "1.3.0";

export const WHATS_NEW_TITLE = "What's New";

/**
 * Optional URL for a "Learn more" button shown below the "Got it" button.
 * Leave as `null` to hide the button.
 */
export const WHATS_NEW_LEARN_MORE_URL: string | null = null;

export type WhatsNewItem = {
  icon: LucideIcon;
  title: string;
  description: string;
};

/**
 * Edit this list for each release. Leaving it empty disables the sheet.
 */
export const WHATS_NEW_ITEMS: WhatsNewItem[] = [
  {
    icon: Highlighter,
    title: "Highlight & Annotate",
    description:
      "Highlight passages and add your own notes inside the reader view.",
  },
  {
    icon: BookOpen,
    title: "Customizable reader view",
    description:
      "Tune fonts, sizes, and other display settings for a more comfortable reading experience.",
  },
  {
    icon: WifiOff,
    title: "True offline mode",
    description:
      "View the contents of your saved links with no connection at all. Configurable from the settings.",
  },
  {
    icon: Info,
    title: "Link details sheet",
    description: "View a link's details in a quick bottom sheet.",
  },
];

const LAST_SEEN_STORAGE_KEY = "whatsNewLastSeen";

let presented = false;

export const markWhatsNewSeen = () =>
  AsyncStorage.setItem(LAST_SEEN_STORAGE_KEY, WHATS_NEW_VERSION);

/**
 * Shows the "What's New" sheet at most once per release, then records it as
 * seen. Safe to call on every launch: it no-ops if there's nothing to show or
 * the current version was already seen, and only ever presents once per app
 * session.
 */
export async function showWhatsNewIfNeeded() {
  if (presented || WHATS_NEW_ITEMS.length === 0) return;
  presented = true;

  const lastSeen = await AsyncStorage.getItem(LAST_SEEN_STORAGE_KEY);
  if (lastSeen === WHATS_NEW_VERSION) return;

  await markWhatsNewSeen();
  SheetManager.show("whats-new-sheet");
}
