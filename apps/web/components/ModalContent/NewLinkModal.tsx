import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import CollectionSelection from "@/components/InputSelect/CollectionSelection";
import TagSelection from "@/components/InputSelect/TagSelection";
import TextInput from "@/components/TextInput";
import unescapeString from "@/lib/client/unescapeString";
import persistBeforeClose from "@/lib/client/persistBeforeClose";
import resolveQuickSaveCollection from "@/lib/client/resolveQuickSaveCollection";
import { useRouter } from "next/router";
import Modal from "../Modal";
import { useTranslation } from "next-i18next";
import { useCollections } from "@linkwarden/router/collections";
import toast from "react-hot-toast";
import {
  PostLinkSchema,
  PostLinkSchemaType,
} from "@linkwarden/lib/schemaValidation";
import { Button } from "@/components/ui/button";
import { Separator } from "../ui/separator";
import { useAddLink } from "@linkwarden/router/links";

type Props = {
  onClose: () => void;
};

export default function NewLinkModal({ onClose }: Props) {
  const { t } = useTranslation();
  const initial = {
    name: "",
    url: "",
    description: "",
    type: "url",
    tags: [],
    collection: {
      id: undefined,
      name: "",
    },
  } as PostLinkSchemaType;

  const addLink = useAddLink({
    toast,
    t,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState<PostLinkSchemaType>(initial);
  const [optionsExpanded, setOptionsExpanded] = useState(false);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const { data: collections = [], isFetched, isError } = useCollections();
  const initialCollectionResolved = useRef(false);
  const manuallySelectedCollection = useRef(false);

  const setCollection = (e: any) => {
    manuallySelectedCollection.current = true;
    setLink((previous) => ({
      ...previous,
      collection: {
        id: e?.__isNew__ ? undefined : e?.value,
        name: e?.label || "Unorganized",
      },
    }));
  };

  const setTags = (selectedOptions: any = []) => {
    const tagNames = selectedOptions.map((option: any) => ({
      name: option.label,
    }));
    setLink({ ...link, tags: tagNames });
  };

  useEffect(() => {
    if (initialCollectionResolved.current || !router.isReady) return;

    // Do not resolve collection context before the collection query settles.
    if (router.pathname.startsWith("/collections/") && !isFetched && !isError) return;

    initialCollectionResolved.current = true;
    if (manuallySelectedCollection.current) return;
    const collection = resolveQuickSaveCollection(router.pathname, router.query.id, collections);

    // Preserve URL, notes and tags entered while the query was loading.
    setLink((previous) => ({ ...previous, collection }));
  }, [router.isReady, router.pathname, router.query.id, collections, isFetched, isError]);

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    // A synchronous guard also prevents a second click before React rerenders.
    if (submittingRef.current) return;

    const dataValidation = PostLinkSchema.safeParse(link);

    if (!dataValidation.success)
      return toast.error(
        `Error: ${
          dataValidation.error.issues[0].message
        } [${dataValidation.error.issues[0].path.join(", ")}]`
      );

    submittingRef.current = true;
    setSubmitting(true);
    try {
      // The mutation hook displays errors and rolls back optimistic updates.
      // Keep the entered bookmark visible if persistence fails.
      await persistBeforeClose(
        link,
        (value) => addLink.mutateAsync(value),
        onClose
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal toggleModal={onClose}>
      <p className="text-xl font-thin">{t("create_new_link")}</p>

      <Separator className="my-3" />

      <div className="grid grid-flow-row-dense sm:grid-cols-5 gap-3">
        <div className="sm:col-span-3 col-span-5">
          <p className="mb-2">{t("link")}</p>
          <TextInput
            ref={inputRef}
            value={link.url || ""}
            onChange={(e) => setLink({ ...link, url: e.target.value })}
            placeholder={t("link_url_placeholder")}
            className="bg-base-200"
          />
        </div>
        <div className="sm:col-span-2 col-span-5">
          <p className="mb-2">{t("collection")}</p>
          {link.collection?.name && (
            <CollectionSelection
              onChange={setCollection}
              defaultValue={{
                value: link.collection?.id,
                label: link.collection?.name || "Unorganized",
              }}
            />
          )}
        </div>
      </div>
      {optionsExpanded && (
        <div className="mt-5 grid sm:grid-cols-2 gap-3">
          <div>
            <p className="mb-2">{t("name")}</p>
            <TextInput
              value={link.name}
              onChange={(e) => setLink({ ...link, name: e.target.value })}
              placeholder={t("link_name_placeholder")}
              className="bg-base-200"
            />
          </div>
          <div>
            <p className="mb-2">{t("tags")}</p>
            <TagSelection
              onChange={setTags}
              defaultValue={
                link.tags?.map((e) => ({ label: e.name, value: e.id })) || []
              }
            />
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2">{t("description")}</p>
            <textarea
              value={unescapeString(link.description || "") || ""}
              onChange={(e) =>
                setLink({ ...link, description: e.target.value })
              }
              placeholder={t("link_description_placeholder")}
              className="resize-none w-full h-32 rounded-md p-2 border-neutral-content bg-base-200 focus:border-primary border-solid border outline-none duration-100"
            />
          </div>
        </div>
      )}
      <div className="flex justify-between items-center mt-5">
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center px-2 w-fit text-sm"
          onClick={() => setOptionsExpanded(!optionsExpanded)}
        >
          <p>{optionsExpanded ? t("hide_options") : t("more_options")}</p>
          <i className={`bi-chevron-${optionsExpanded ? "up" : "down"}`} />
        </Button>
        <Button variant="primary" onClick={submit} disabled={submitting}>
          {t("create_link")}
        </Button>
      </div>
    </Modal>
  );
}
