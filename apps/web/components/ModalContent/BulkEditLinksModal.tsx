import React, { useRef, useState } from "react";
import CollectionSelection from "@/components/InputSelect/CollectionSelection";
import TagSelection from "@/components/InputSelect/TagSelection";
import useLinkStore from "@/store/links";
import { LinkIncludingShortenedCollectionAndTags } from "@linkwarden/types/global";
import toast from "react-hot-toast";
import Modal from "../Modal";
import { useTranslation } from "next-i18next";
import { useBulkEditLinks } from "@linkwarden/router/links";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";

type Props = {
  onClose: () => void;
  selectedLinkIds: number[];
};

export default function BulkEditLinksModal({
  onClose,
  selectedLinkIds,
}: Props) {
  const { t } = useTranslation();
  const { clearSelected } = useLinkStore();
  const selectionCount = selectedLinkIds.length;
  const [submitLoader, setSubmitLoader] = useState(false);
  const submittingRef = useRef(false);
  const [removePreviousTags, setRemovePreviousTags] = useState(false);
  const [updatedValues, setUpdatedValues] = useState<
    Pick<LinkIncludingShortenedCollectionAndTags, "tags" | "collectionId">
  >({ tags: [] });

  const updateLinks = useBulkEditLinks();
  const setCollection = (e: any) => {
    const collectionId = e?.value || null;
    setUpdatedValues((prevValues) => ({ ...prevValues, collectionId }));
  };

  const setTags = (e: any) => {
    const tags = e.map((tag: any) => ({ name: tag.label }));
    setUpdatedValues((prevValues) => ({ ...prevValues, tags }));
  };

  const submit = async () => {
    if (submittingRef.current || selectionCount === 0) return;
    submittingRef.current = true;
    setSubmitLoader(true);

    const links = selectedLinkIds.map((id) => ({ id }));
    const load = toast.loading(t("updating"));
    let succeeded = false;
    try {
      await updateLinks.mutateAsync({
        links,
        newData: updatedValues,
        removePreviousTags,
      });
      succeeded = true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("update_failed", { defaultValue: "Unable to update bookmarks" })
      );
    } finally {
      toast.dismiss(load);
      submittingRef.current = false;
      setSubmitLoader(false);
    }

    if (succeeded) {
      clearSelected();
      onClose();
      toast.success(t("updated"));
    }
  };

  return (
    <Modal toggleModal={onClose} dismissible={!submitLoader}>
      <p className="text-xl font-thin">
        {selectionCount === 1
          ? t("edit_link")
          : t("edit_links", { count: selectionCount })}
      </p>
      <Separator className="my-3" />

      <div className="mt-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <p className="mb-2">{t("move_to_collection")}</p>
            <CollectionSelection
              showDefaultValue={false}
              onChange={setCollection}
              creatable={false}
            />
          </div>

          <div>
            <p className="mb-2">{t("add_tags")}</p>
            <TagSelection onChange={setTags} />
          </div>
        </div>
        <div className="sm:ml-auto w-1/2 p-3">
          <label className="flex items-center gap-2 ">
            <input
              type="checkbox"
              className="checkbox checkbox-primary"
              checked={removePreviousTags}
              onChange={(e) => setRemovePreviousTags(e.target.checked)}
            />
            {t("remove_previous_tags")}
          </label>
        </div>
      </div>

      <div className="flex justify-end items-center mt-5">
        <Button
          variant="primary"
          onClick={submit}
          disabled={submitLoader || selectionCount === 0}
        >
          {t("save_changes")}
        </Button>
      </div>
    </Modal>
  );
}
