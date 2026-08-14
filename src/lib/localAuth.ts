/**
 * Authorization for the tools that touch the operator's machine.
 *
 * Every other capability in Jarvis is scoped per user: memory, to-dos and
 * Composio connections are all keyed by Convex user id, so one account cannot
 * reach another's data. The local tools are different in kind — the vault and
 * the projects folder belong to the *host*, not to an account. Any signed-in
 * user reaching them would be reading and writing the machine's disk.
 *
 * So authentication is not sufficient here; the caller must be the operator.
 * Set LOCAL_OPERATOR_EMAIL in .env.local to the account that owns the machine.
 * If it is unset the route falls back to authentication alone, which is only
 * safe on a single-account deployment — see the warning below.
 */

import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

let warned = false;

export type OperatorCheck =
  | { ok: true; email?: string }
  | { ok: false; response: NextResponse };

export async function requireOperator(
  authHeader: string | null,
  toolLabel: string
): Promise<OperatorCheck> {
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  let user: { email?: string } | null = null;
  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(jwt);
    user = await convex.query(api.auth.me, {});
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const configured = process.env.LOCAL_OPERATOR_EMAIL?.trim().toLowerCase();
  if (!configured) {
    if (!warned) {
      warned = true;
      console.warn(
        "[jarvis] LOCAL_OPERATOR_EMAIL is not set. Any authenticated account can use the " +
          "local vault and project tools, which read and write this machine's disk. Set it " +
          "in .env.local if more than one person can sign in to this deployment."
      );
    }
    return { ok: true, email: user.email };
  }

  const caller = user.email?.trim().toLowerCase();
  if (!caller || caller !== configured) {
    console.warn(
      `[jarvis] refused local tool "${toolLabel}" for non-operator account ${caller ?? "(no email)"}`
    );
    return {
      ok: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "not_operator",
          message:
            "This account is not the configured operator for this machine, so local vault and project tools are unavailable.",
        },
        { status: 403 }
      ),
    };
  }

  return { ok: true, email: caller };
}
