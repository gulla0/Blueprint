import Link from "next/link";
import { CardanoWallet } from "@meshsdk/react";

export default function NavBar() {
  return (
    <nav className="fixed top-0 z-50 w-full px-6 py-4">
      <div className="container mx-auto flex items-center justify-between">
        <div className="text-lg font-bold">
          <Link href="/">Aiken Blueprint</Link>
        </div>
        <ul className="flex items-center gap-8 text-sm font-medium">
          <li className="flex items-center">
            <Link href="/docs">Docs</Link>
          </li>
          <li className="flex items-center">
            <CardanoWallet isDark={false} persist={true} />
          </li>
        </ul>
      </div>
    </nav>
  );
}
