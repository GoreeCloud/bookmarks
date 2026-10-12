import React, { ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "next-i18next";
import Modal from "./Modal";
import { Separator } from "./ui/separator";
import confirmActionBeforeClose from "@/lib/client/confirmActionBeforeClose";

type Props = {
  toggleModal: () => void;
  className?: string;
  children: ReactNode;
  title: string;
  onConfirmed: () => unknown;
  dismissible?: boolean;
};

export default function ConfirmationModal({
  toggleModal,
  className,
  children,
  title,
  onConfirmed,
  dismissible = true,
}: Props) {
  const { t } = useTranslation();
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);

  const closeIfIdle = () => {
    if (!pendingRef.current) toggleModal();
  };

  const confirm = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      await confirmActionBeforeClose(onConfirmed, toggleModal);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  return (
    <Modal
      toggleModal={closeIfIdle}
      className={className}
      dismissible={dismissible && !pending}
    >
      <p className="text-xl font-thin">{title}</p>
      <Separator className="mb-3 mt-1" />
      {children}
      <div className="w-full flex items-center justify-end gap-2 mt-3">
        <Button
          variant="ghost"
          className="hover:bg-base-200"
          disabled={pending}
          onClick={closeIfIdle}
        >
          {t("cancel")}
        </Button>
        <Button variant="destructive" disabled={pending} onClick={confirm}>
          {t("confirm")}
        </Button>
      </div>
    </Modal>
  );
}
