import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { type AppType } from "next/app";
import { Geist } from "next/font/google";
import "@meshsdk/react/styles.css";
import { MeshProvider } from "@meshsdk/react";
import Layout from "~/components/Layout";

import { api } from "~/utils/api";

import "~/styles/globals.css";

const geist = Geist({
  subsets: ["latin"],
});

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <SessionProvider session={session}>
      <div className={geist.className}>
        <MeshProvider>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </MeshProvider>
      </div>
    </SessionProvider>
  );
};

export default api.withTRPC(MyApp);
