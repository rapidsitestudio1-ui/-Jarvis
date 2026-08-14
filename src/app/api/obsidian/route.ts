import { NextRequest, NextResponse } from "next/server";
import {
  appendVaultNote,
  createVaultNote,
  listNotes,
  readVaultNote,
  searchVault,
  vaultRoot,
} from "@/lib/obsidian";
import { requireOperator } from "@/lib/localAuth";

/**
 * Vault tool dispatcher. These tools can't live in Convex like the rest —
 * Convex actions have no access to the operator's local disk — so the Next.js
 * server (which runs on the same machine as the vault) handles them instead.
 *
 * The vault belongs to the host rather than to an account, so being signed in
 * is not enough: the caller must be the configured operator.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  const auth = await requireOperator(request.headers.get("authorization"), "vault");
  if (!auth.ok) return auth.response;

  let name: string;
  let args: any;
  try {
    const body = await request.json();
    name = body.name;
    args = body.arguments ?? {};
  } catch {
    return NextResponse.json({ ok: false, message: "Malformed request body" }, { status: 400 });
  }

  try {
    vaultRoot(); // fail fast with a clear message if the vault isn't configured
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : "Vault is not configured",
    });
  }

  try {
    switch (name) {
      case "search_vault":
        return NextResponse.json(
          await searchVault({ query: args.query, max_results: args.max_results })
        );

      case "list_vault_notes":
        return NextResponse.json(
          await listNotes({ folder: args.folder, max_results: args.max_results })
        );

      case "read_vault_note":
        return NextResponse.json(await readVaultNote({ path: args.path, title: args.title }));

      case "create_vault_note":
        return NextResponse.json(
          await createVaultNote({
            title: args.title,
            content: args.content,
            folder: args.folder,
            tags: args.tags,
          })
        );

      case "append_vault_note":
        return NextResponse.json(
          await appendVaultNote({
            path: args.path,
            title: args.title,
            content: args.content,
            heading: args.heading,
          })
        );

      default:
        return NextResponse.json({ ok: false, message: `Unknown vault tool "${name}"` });
    }
  } catch (err) {
    // Raw errors carry absolute filesystem paths, and this result is relayed
    // to the model as function_call_output — keep the detail server-side.
    console.error(`[jarvis] vault tool "${name}" failed:`, err);
    return NextResponse.json({
      ok: false,
      error: "vault_error",
      message: "The vault operation failed. See the server logs for details.",
    });
  }
}
