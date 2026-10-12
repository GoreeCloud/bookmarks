import React, { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import { useTranslation } from "next-i18next";
import toast from "react-hot-toast";

type Props = {
  text: string;
};

const CopyButton: React.FC<Props> = ({ text }) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const handleCopy = async () => {
    if (busy) return;
    setBusy(true);

    try {
      const succeeded = await copyTextToClipboard(text);
      if (!succeeded) {
        toast.error(
          t("clipboard_copy_failed", {
            defaultValue: "Could not copy to clipboard",
          })
        );
        return;
      }

      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        setCopied(false);
      }, 1000);
    } catch {
      // Clipboard permissions may fail without any readable exception.
      toast.error(
        t("clipboard_copy_failed", {
          defaultValue: "Could not copy to clipboard",
        })
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ghost"
      type="button"
      size="icon"
      onClick={handleCopy}
      disabled={busy}
      aria-label={
        copied
          ? t("copied")
          : t("copy_to_clipboard", {
              defaultValue: "Copy to clipboard",
            })
      }
    >
      {copied ? (
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          className="h-5 w-5 text-success"
          viewBox="0 0 16 16"
        >
          <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0" />
        </svg>
      ) : (
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          fill="currentColor"
          className="h-5 w-5"
          viewBox="0 0 16 16"
        >
          <path
            fillRule="evenodd"
            d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 
               2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 
               1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 
               0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 
               0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 
               2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"
          />
        </svg>
      )}
    </Button>
  );
};

export default CopyButton;
