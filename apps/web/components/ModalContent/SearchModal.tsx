import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { toast } from "react-hot-toast";
import { useTranslation } from "next-i18next";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ADVANCED_SEARCH_OPERATORS } from "@/components/SearchBar";
import {
  RECENT_SEARCHES_KEY,
  RecentSearch,
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  saveRecentSearches,
} from "@/lib/client/recentSearches";

export const isAppleDevice =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [recents, setRecents] = useState<RecentSearch[]>([]);

  useEffect(() => {
    // Read only after hydration; never render browser storage during SSR.
    const refresh = () => {
      try {
        setRecents(loadRecentSearches(window.localStorage));
      } catch {
        setRecents([]);
      }
    };
    refresh();

    const onStorage = (event: StorageEvent) => {
      if (event.key === RECENT_SEARCHES_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persistRecents = (updated: RecentSearch[]) => {
    setRecents(updated);
    try {
      saveRecentSearches(window.localStorage, updated);
    } catch {
      // Browsers may prohibit storage; searching remains functional.
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const submit = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;

    persistRecents(addRecentSearch(recents, trimmed));

    router.push("/search?q=" + encodeURIComponent(trimmed));
    onClose();
  };

  const removeRecent = (query: string) => {
    const updated = recents.filter((entry) => entry.query !== query);
    persistRecents(updated);
  };

  const clearHistory = () => {
    setRecents([]);
    try {
      clearRecentSearches(window.localStorage);
    } catch {
      // Clearing this modal's history remains possible without storage.
    }
    inputRef.current?.focus();
  };

  const appendOperator = (operator: string) => {
    setSearchQuery((prev) => {
      const needsSpace = prev.length > 0 && !prev.endsWith(" ");
      return `${prev}${needsSpace ? " " : ""}${operator}`;
    });
    inputRef.current?.focus();
  };

  return (
    <Modal toggleModal={onClose} hideCloseButton>
      <div className="flex items-center gap-3">
        <i className="bi-search text-neutral text-lg leading-none" />
        <input
          type="text"
          ref={inputRef}
          autoFocus
          autoComplete="off"
          aria-label={t("search_for_links")}
          placeholder={t("search_for_links")}
          value={searchQuery}
          onChange={(e) => {
            e.target.value.includes("%") &&
              toast.error(t("search_query_invalid_symbol"));
            setSearchQuery(e.target.value.replace("%", ""));
          }}
          onKeyDown={(e) => e.key === "Enter" && submit(searchQuery)}
          className="w-full bg-transparent outline-none text-lg"
        />
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <Kbd>{isAppleDevice ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </div>
      </div>

      <div className="border-t border-neutral-content -mx-4 sm:-mx-5 mt-4" />

      <div className="sm:max-h-80 sm:overflow-y-auto -mx-4 sm:-mx-5 -mb-4 sm:-mb-5">
        {recents.length > 0 && (
          <div className="px-4 sm:px-5">
            <div className="flex items-center justify-between gap-3 mt-4">
              <p className="text-xs font-bold text-neutral">{t("recent")}</p>
              <button
                type="button"
                onClick={clearHistory}
                className="text-xs text-neutral underline underline-offset-2 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-sm"
              >
                {t("clear_search_history", { defaultValue: "Clear history" })}
              </button>
            </div>
            <div className="flex flex-col gap-1 mt-2">
              {recents.map((entry) => (
                <div
                  key={entry.query}
                  className="flex items-center gap-2 rounded-md hover:bg-base-200 duration-100"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    onClick={() => submit(entry.query)}
                  >
                    <i className="bi-clock-history text-neutral" aria-hidden="true" />
                    <span className="truncate text-sm">{entry.query}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={t("remove_recent_search", {
                      defaultValue: "Remove recent search: {{query}}",
                      query: entry.query,
                    })}
                    onClick={() => removeRecent(entry.query)}
                  >
                    <i className="bi-x text-lg text-neutral" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-content -mx-4 sm:-mx-5 mt-4" />
          </div>
        )}

        <div className="px-4 sm:px-5 pb-4 sm:pb-5">
          <p className="text-xs font-bold text-neutral mt-4">
            {t("suggested_search_operators")}
          </p>
          <div className="flex flex-col gap-1 mt-2">
            {ADVANCED_SEARCH_OPERATORS.map((entry) => (
              <button
                key={entry.operator}
                type="button"
                className="flex items-center gap-2 justify-between rounded-md px-2 py-1.5 text-left hover:bg-base-200 duration-100"
                onClick={() => appendOperator(entry.operator)}
              >
                <div className="flex items-center gap-3">
                  <i className={`${entry.icon} text-primary`} />
                  <span className="text-sm">{t(entry.labelKey)}</span>
                </div>
                <span className="font-mono text-xs px-1.5 py-0.5 rounded-md bg-base-200 border border-neutral-content text-base-content">
                  {entry.operator}
                </span>
              </button>
            ))}
          </div>

          <div className="flex justify-end mt-2">
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link
                href="https://docs.linkwarden.app/usage/advanced-search"
                target="_blank"
                className="flex items-center gap-1"
              >
                {t("learn_more")}
                <i className="bi-box-arrow-up-right text-xs" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
