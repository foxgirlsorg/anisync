"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export default function NavClient({
  links,
  loggedIn,
  email,
}: {
  links: { href: string; label: string }[];
  loggedIn: boolean;
  email?: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setOpen(false);
    router.push("/login");
    router.refresh();
  }

  if (!loggedIn) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <Link href="/login" className="text-muted hover:text-foreground">
          Log in
        </Link>
        <Link href="/register" className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-foreground">
          Register
        </Link>
      </div>
    );
  }

  return (
    <>
      <nav className="hidden items-center gap-5 text-sm sm:flex">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? "text-foreground" : "text-muted hover:text-foreground"}
          >
            {l.label}
          </Link>
        ))}
        <button onClick={logout} className="text-muted hover:text-danger">
          Log out
        </button>
      </nav>
      <button
        aria-label="Menu"
        className="flex flex-col gap-1.5 sm:hidden"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="block h-0.5 w-5 bg-foreground" />
        <span className="block h-0.5 w-5 bg-foreground" />
        <span className="block h-0.5 w-5 bg-foreground" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-14 border-b border-border bg-background p-4 sm:hidden">
          <nav className="flex flex-col gap-3 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-border pt-3 text-xs text-muted">{email}</div>
            <button onClick={logout} className="text-left text-danger">
              Log out
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
