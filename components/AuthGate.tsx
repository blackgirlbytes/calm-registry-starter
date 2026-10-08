"use client";

import { useEffect, useState } from "react";
import { authEnabled, getBrowserSupabase } from "@/lib/client";
import { Status } from "./Status";

export function AuthGate({ children, reason }: { children: React.ReactNode; reason?: string }) {
  const [state, setState] = useState<"loading" | "in" | "out">(authEnabled ? "loading" : "in");

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setState(data.session ? "in" : "out"));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setState(session ? "in" : "out"));
    return () => data.subscription.unsubscribe();
  }, []);

  if (state === "in") return <>{children}</>;
  if (state === "loading") return <Status>One moment…</Status>;
  return <SignIn reason={reason} />;
}

const REASSURANCES = [
  "We email you a one-time sign-in link.",
  "Come back from any device, anytime.",
  "Family and friends never need an account.",
];

export function SignIn({ reason }: { reason?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const supabase = getBrowserSupabase();
    if (!supabase) return setError("Sign-in isn't set up for this site yet.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <main className="grid min-h-dvh content-center gap-12 py-12 lg:grid-cols-2 lg:items-center lg:gap-24">
      <div className="space-y-6">
        <h1 className="font-serif text-[33px] leading-tight font-semibold lg:text-[52px] lg:leading-[1.08]">
          Save your registry
        </h1>
        <p className="max-w-[44ch] text-muted lg:text-[17px]">
          {reason ?? "Sign in with your email so you can come back to your registry anytime. No password needed."}
        </p>
        <ul className="hidden space-y-2 lg:block">
          {REASSURANCES.map((line) => (
            <li key={line} className="flex gap-3">
              <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {line}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-surface p-6 lg:p-10">
        {sent ? (
          <div role="status" className="space-y-2">
            <p className="font-serif text-[21px] font-semibold">Check your inbox</p>
            <p className="text-muted">
              We sent a sign-in link to <span className="text-text">{email}</span>. Open it on this device to pick up where
              you left off.
            </p>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4">
            <label htmlFor="auth-email" className="block font-semibold">
              Your email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="field lg:py-4 lg:text-[17px]"
            />
            <button className="btn-primary w-full lg:py-4 lg:text-[17px]">Email me a link</button>
            {error && (
              <p role="alert" className="text-[13px] text-danger">
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
