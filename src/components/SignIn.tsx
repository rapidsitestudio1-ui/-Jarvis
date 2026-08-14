"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuthActions } from "@convex-dev/auth/react";

export function SignIn() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn("password", { email, password, flow });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(
        /invalid/i.test(message) && flow === "signIn"
          ? "Invalid credentials. New here? Switch to Create access."
          : /already exists/i.test(message)
            ? "Account already exists. Switch to Sign in."
            : "Authentication failed. Check your email and password (min 8 characters)."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative z-10 flex h-screen w-screen items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="glass w-[380px] rounded-2xl p-8"
      >
        <div className="mb-1 flex items-baseline gap-3">
          <h1 className="text-[15px] font-semibold tracking-[0.42em] text-white/90">
            J A R V I S
          </h1>
          <span className="label-xs">Control Center</span>
        </div>
        <p className="mb-7 text-[12.5px] text-white/40">
          {flow === "signIn"
            ? "Identify yourself to access the system."
            : "Register a new operator credential."}
        </p>

        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label className="label-xs mb-1.5 block">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mono w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/85 outline-none transition focus:border-cyan-300/40 focus:bg-cyan-400/[0.04]"
              placeholder="operator@stark.io"
            />
          </div>
          <div>
            <label className="label-xs mb-1.5 block">Password</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={flow === "signIn" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mono w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[13px] text-white/85 outline-none transition focus:border-cyan-300/40 focus:bg-cyan-400/[0.04]"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-[11.5px] leading-snug text-red-300/85">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mono w-full rounded-lg border border-cyan-300/25 bg-cyan-400/10 py-2.5 text-[12px] tracking-[0.25em] text-cyan-100 uppercase transition hover:bg-cyan-400/20 hover:shadow-[0_0_30px_rgba(69,216,255,0.15)] disabled:opacity-50"
          >
            {busy ? (
              <span className="shimmer-text">Authenticating…</span>
            ) : flow === "signIn" ? (
              "Sign in"
            ) : (
              "Create access"
            )}
          </button>
        </form>

        <button
          onClick={() => {
            setFlow(flow === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
          className="mt-5 w-full text-center text-[11.5px] text-white/35 transition hover:text-cyan-200/70"
        >
          {flow === "signIn" ? "New operator? Create access" : "Have credentials? Sign in"}
        </button>
      </motion.div>
    </div>
  );
}
