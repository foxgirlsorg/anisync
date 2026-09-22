import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import NavClient from "@/components/NavClient";

export default async function Nav() {
  const user = await getCurrentUser();

  const links = user
    ? [
        { href: "/dashboard", label: "Dashboard" },
        { href: "/dashboard/sync", label: "Sync settings" },
        { href: "/dashboard/history", label: "History" },
        ...(user.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
      ]
    : [];

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href={user ? "/dashboard" : "/"} className="font-semibold tracking-tight">
          Ani<span className="text-accent">Sync</span>
        </Link>
        <NavClient links={links} loggedIn={Boolean(user)} email={user?.email} />
      </div>
    </header>
  );
}
