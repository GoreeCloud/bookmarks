import { useLinks } from "@linkwarden/router/links";
import { View } from "react-native";
import useAuthStore from "@/store/auth";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import Links from "@/components/Links";

export default function LinksScreen() {
  const { auth } = useAuthStore();
  const { search } = useLocalSearchParams<{ search?: string }>();

  const { links, data } = useLinks(
    {
      sort: 0,
      searchQueryString: decodeURIComponent(search ?? ""),
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
