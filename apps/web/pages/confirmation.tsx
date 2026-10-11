import CenteredForm from "@/components/CenteredForm";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";
import { useState } from "react";
import toast from "react-hot-toast";
import { useTranslation } from "next-i18next";
import getServerSideProps from "@/lib/client/getServerSideProps";
import { Button } from "@/components/ui/button";

export default function EmailConfirmaion() {
  const router = useRouter();

  const { t } = useTranslation();

  const [submitLoader, setSubmitLoader] = useState(false);

  const resend = async () => {
    if (submitLoader) return;
    else if (!router.query.email) return;

    setSubmitLoader(true);

    const load = toast.loading(t("authenticating"));

    const res = await signIn("email", {
      email: decodeURIComponent(router.query.email as string),
      callbackUrl: "/",
      redirect: false,
    });

    toast.dismiss(load);

    setSubmitLoader(false);

    toast.success(t("verification_email_sent"));
  };

  return (
    <CenteredForm header={t("check_your_email")}>
      <div className="max-w-[30rem] min-w-80 w-full mx-auto flex flex-col gap-3">
        <p>{t("verification_email_sent_desc")}</p>

        {router.query.email && typeof router.query.email === "string" && (
          <p className="text-center tracking-widest mb-3 break-all">
            {decodeURIComponent(router.query.email)}
          </p>
        )}

        <div className="mx-auto w-fit">
          <Button onClick={resend} variant="ghost" size="sm">
            {t("resend_email")}
          </Button>
        </div>
      </div>
    </CenteredForm>
  );
}

export { getServerSideProps };
