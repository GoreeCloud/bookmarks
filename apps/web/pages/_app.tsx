import React, { ReactElement, ReactNode } from "react";
import "@/styles/globals.css";
import "@/styles/glaze-foundation.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { SessionProvider } from "next-auth/react";
import type { AppProps } from "next/app";
import Head from "next/head";
import AuthRedirect from "@/layouts/AuthRedirect";
import toast from "react-hot-toast";
import { Toaster, ToastBar } from "react-hot-toast";
import { Session } from "next-auth";
// import useInitialData from "@/hooks/useInitialData";
import { appWithTranslation } from "next-i18next";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextPage } from "next";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
    },
  },
});

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement<any>) => ReactNode;
};

type PageProps = { session?: Session | null };

type AppPropsWithLayout = AppProps<PageProps> & {
  Component: NextPageWithLayout<PageProps>;
};

function App({ Component, pageProps }: AppPropsWithLayout) {
  const getLayout = Component.getLayout ?? ((page) => page);


  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider
        session={pageProps.session}
        refetchOnWindowFocus={false}
        basePath="/api/v1/auth"
      >
        <Head>
          <title>GoreeCloud Bookmarks</title>
          <meta name="description" content="Save, preserve, and rediscover your digital knowledge with GoreeCloud Bookmarks." />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="theme-color" content="#11233b" />
          <link rel="icon" href="/goreecloud-bookmarks-mark.svg" type="image/svg+xml" />
          <link rel="manifest" href="/site.webmanifest" />
        </Head>
        <AuthRedirect>
          {/* <GetData> */}
          <Toaster
            position="top-center"
            reverseOrder={false}
            toastOptions={{
              className:
                "border border-sky-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white",
            }}
          >
            {(t) => (
              <ToastBar toast={t}>
                {({ icon, message }) => (
                  <div
                    className="flex flex-row"
                    data-testid="toast-message-container"
                    data-type={t.type}
                  >
                    {icon}
                    <span data-testid="toast-message">{message}</span>
                    {t.type !== "loading" && (
                      <div
                        data-testid="close-toast-button"
                        onClick={() => toast.dismiss(t.id)}
                      ></div>
                    )}
                  </div>
                )}
              </ToastBar>
            )}
          </Toaster>
          {getLayout(<Component {...pageProps} />)}
          {/* </GetData> */}
        </AuthRedirect>
      </SessionProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default appWithTranslation(App);
