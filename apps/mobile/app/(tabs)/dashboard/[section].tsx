import { useLinks } from "@linkwarden/router/links";
import { View, Platform, TouchableOpacity } from "react-native";
import { Plus } from "lucide-react-native";
import { SheetManager } from "react-native-actions-sheet";
import { useColorScheme } from "nativewind";
import { rawTheme, ThemeName } from "@/lib/colors";
import useAuthStore from "@/store/auth";
import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useMemo } from "react";
import { useCollections } from "@linkwarden/router/collections";
import Links from "@/components/Links";

export default function LinksScreen() {
  const { auth } = useAuthStore();
  const { search, section, collectionId } = useLocalSearchParams<{
    search?: string;
    section?: "pinned-links" | "recent-links" | "collection";
    collectionId?: string;
  }>();

  const navigation = useNavigation();
  const collections = useCollections(auth);
  const { colorScheme } = useColorScheme();
  const isIOS26Plus =
    Platform.OS === "ios" && parseInt(Platform.Version, 10) >= 26;

  const title = useMemo(() => {
    if (section === "pinned-links") return "Pinned Links";
    if (section === "recent-links") return "Recent Links";

    if (section === "collection") {
      return (
        collections.data?.find((c) => c.id?.toString() === collectionId)
          ?.name || "Collection"
      );
    }

    return "Links";
  }, [section, collections.data, collectionId]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: title,
      headerSearchBarOptions: {
        placeholder: `Search ${title}`,
        ...(isIOS26Plus && {
          allowToolbarIntegration: false,
          placement: "integratedButton",
        }),
      },
      headerRight:
        section === "pinned-links"
          ? undefined
          : () => (
              <TouchableOpacity
                onPress={() =>
                  SheetManager.show(
                    "add-link-sheet",
                    section === "collection" && collectionId
                      ? {
                          payload: {
                            collection: {
                              id: Number(collectionId),
                              name: title,
                            },
                          },
                        }
                      : undefined
                  )
                }
              >
                <Plus
                  size={21}
                  color={rawTheme[colorScheme as ThemeName].primary}
                />
              </TouchableOpacity>
            ),
    });
  }, [title, navigation, section, collectionId, colorScheme]);

  const { links, data } = useLinks(
    {
      sort: 0,
      searchQueryString: decodeURIComponent(search ?? ""),
      collectionId: Number(collectionId),
      pinnedOnly: section === "pinned-links",
    },
    auth
  );

  return (
    <View
      className="h-full bg-base-100"
      collapsable={false}
      collapsableChildren={false}
    >
      <Links links={links} data={data} />
    </View>
  );
}
