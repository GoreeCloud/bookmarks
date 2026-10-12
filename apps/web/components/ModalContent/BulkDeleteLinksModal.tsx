import React, { useRef, useState } from "react";
import useLinkStore from "@/store/links";
import Modal from "../Modal";
import { Button } from "@/components/ui/button";
import { useTranslation } from "next-i18next";
import { useBulkDeleteLinks } from "@linkwarden/router/links";
import toast from "react-hot-toast";
import { Separator } from "../ui/separator";

type Props = {
  onClose: () => void;
  selectedLinkIds: number[];
};

export default function BulkDeleteLinksModal({
  onClose,
  selectedLinkIds,
}: Props) {
  const { t } = useTranslation();
  const { clearSelected } = useLinkStore();
  const selectionCount = selectedLinkIds.length;
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);

  const deleteLinksById = useBulkDeleteLinks();

  const deleteLink = async () => {
    // Guard synchronously against two destructive requests before React renders.
    if (deletingRef.current || selectedLinkIds.length === 0) return;
    deletingRef.current = true;
    setDeleting(true);

    const ids = [...selectedLinkIds];
    const load = toast.loading(t("deleting"));
    let succeeded = false;
    try {
      await deleteLinksById.mutateAsync(ids);
      succeeded = true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("delete_failed", { defaultValue: "Unable to delete bookmarks" })
      );
    } finally {
      toast.dismiss(load);
      deletingRef.current = false;
      setDeleting(false);
    }

    if (succeeded) {
      clearSelected();
      onClose();
      toast.success(t("deleted"));
    }
  };

  return (
    <Modal toggleModal={onClose} dismissible={!deleting}>
      <p className="text-xl font-thin text-red-500">
        {selectionCount === 1
          ? t("delete_link")
          : t("delete_links", { count: selectionCount })}
      </p>

      <Separator className="my-3" />

      <div className="flex flex-col gap-3">
        <p>
          {selectionCount === 1
            ? t("link_deletion_confirmation_message")
            : t("links_deletion_confirmation_message", {
                count: selectionCount,
              })}
        </p>

        <div role="alert" className="alert alert-warning">
          <i className="bi-exclamation-triangle text-xl" />
          <span>{t("warning_irreversible")}</span>
        </div>

        <Button
          className="ml-auto"
          variant="destructive"
          onClick={deleteLink}
          disabled={deleting || selectionCount === 0}
        >
          <i className="bi-trash text-xl" />
          {t("delete")}
        </Button>
      </div>
    </Modal>
  );
}
