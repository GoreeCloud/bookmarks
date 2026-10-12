import { LinkIncludingShortenedCollectionAndTags } from "@linkwarden/types/global";
import Link from "next/link";
import React from "react";
import safeExternalUrl from "@/lib/client/safeExternalUrl";

function LinkTypeBadge({
  link,
}: {
  link: LinkIncludingShortenedCollectionAndTags;
}) {
  const externalUrl = safeExternalUrl(link.url);
  const host = externalUrl ? new URL(externalUrl).host.toLowerCase() : "";

  const typeIcon = () => {
    switch (link.type) {
      case "pdf":
        return "bi-file-earmark-pdf";
      case "image":
        return "bi-file-earmark-image";
      default:
        return "bi-link-45deg";
    }
  };

  return externalUrl && host ? (
    <Link
      href={externalUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={link.url || ""}
      onClick={(e) => e.stopPropagation()}
      className="flex gap-1 item-center select-none text-neutral hover:opacity-70 duration-100 max-w-full w-fit"
    >
      <i className="bi-link-45deg text-lg leading-none"></i>
      <p className="text-xs truncate">{host}</p>
    </Link>
  ) : (
    <div className="flex gap-1 item-center select-none text-neutral duration-100 max-w-full w-fit">
      <i className={typeIcon() + " text-md leading-none"}></i>
      <p className="text-xs truncate">{link.type}</p>
    </div>
  );
}

export default React.memo(LinkTypeBadge);
