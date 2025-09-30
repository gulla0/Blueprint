import { type ReactNode } from "react";
import NavBar from "./NavBar";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  return (
    <>
      <NavBar />
      <main className="flex min-h-screen flex-col items-center justify-center">
        {children}
      </main>
    </>
  );
}
