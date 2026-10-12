import React, { useRef, useState } from "react";
import { LinkIncludingShortenedCollectionAndTags } from "@linkwarden/types/global";
import Modal from "../Modal";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { useTranslation } from "next-i18next";
import { useDeleteLink } from "@linkwarden/router/links";
import toast from "react-hot-toast";
import { Separator } from "../ui/separator";
import confirmDeletePersistence from "@/lib/client/confirmDeletePersistence";

type Props = {
  onClose: Function;
  activeLink: LinkIncludingShortenedCollectionAndTags;
};

export default function DeleteLinkModal({ onClose, activeLink }: Props) {
  const { t } = useTranslation();
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);

  const deleteLink = useDeleteLink({ toast, t });
  const router = useRouter();

  const submit = async () => {
    if (deletingRef.current || !Number.isSafeInteger(activeLink.id) || !activeLink.id) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await confirmDeletePersistence(
        () => deleteLink.mutateAsync(activeLink.id as number),
        () => {
          onClose();
          if (
            router.pathname.startsWith("/links/[id]") ||
            router.pathname.startsWith("/preserved/[id]")
          ) {
            void router.push("/dashboard");
          }
        }
      );
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <Modal toggleModal={onClose}>
      <p className="text-xl font-thin text-red-500">{t("delete_link")}</p>

      <Separator className="my-3" />

      <div className="flex flex-col gap-3">
        <p>{t("link_deletion_confirmation_message")}</p>


        <Button className="ml-auto" variant="destructive" onClick={submit} disabled={deleting || !activeLink.id}>
          <i className="bi-trash text-xl" />
          {t("delete")}
        </Button>
      </div>
    </Modal>
  );
}
