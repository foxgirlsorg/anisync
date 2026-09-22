"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-sm">
      <h1 className="mb-1 text-xl font-semibold">{mode === "login" ? "Log in" : "Create an account"}</h1>
      <p className="mb-6 text-sm text-muted">
        {mode === "login" ? "Welcome back to AniSync." : "The first account registered becomes the admin."}
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md px-3 py-2 outline-none focus:border-accent"
          />
        </label>
        {mode === "register" && (
          <label className="flex flex-col gap-1 text-sm">
            Confirm password
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="rounded-md px-3 py-2 outline-none focus:border-accent"
            />
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-md bg-accent py-2 font-medium text-accent-foreground disabled:opacity-50"
        >
          {loading ? "Please wait…" : mode === "login" ? "Log in" : "Register"}
        </button>
      </form>
      <p className="mt-4 text-sm text-muted">
        {mode === "login" ? (
          <>
            No account yet?{" "}
            <a href="/register" className="text-accent">
              Register
            </a>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <a href="/login" className="text-accent">
              Log in
            </a>
          </>
        )}
      </p>
    </div>
  );
}
