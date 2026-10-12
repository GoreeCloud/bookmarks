import { LinkIncludingShortenedCollectionAndTags } from "@linkwarden/types/global";
import getFormatBasedOnPreference from "@linkwarden/lib/getFormatBasedOnPreference";
import { LinksRouteTo } from "@linkwarden/prisma/client";
import safeExternalUrl from "./safeExternalUrl";

const openLink = (
  link: LinkIncludingShortenedCollectionAndTags,
  user: any,
  openModal: () => void
) => {
  if (user.linksRouteTo === LinksRouteTo.DETAILS) {
    openModal();
  } else {
    const format = getFormatBasedOnPreference({
      link,
      preference: user.linksRouteTo,
    });

    const target =
      format !== null
        ? `/preserved/${link?.id}?format=${encodeURIComponent(format)}`
        : safeExternalUrl(link.url);

    // Avoid opening unsafe legacy URLs or URL-less notes as external tabs.
    if (!target) {
      openModal();
      return;
    }

    window.open(target, "_blank", "noopener,noreferrer");
  }
};

export default openLink;
