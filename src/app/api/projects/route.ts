import { NextRequest, NextResponse } from "next/server";
import { projectsRoot, startWebsiteBuild } from "@/lib/projects";
import { requireOperator } from "@/lib/localAuth";

/**
 * Client-project scaffolding. Same reasoning and auth contract as the vault
 * route: Convex actions cannot reach local disk, so this runs in the Next.js
 * process on the operator's machine. This folder belongs to the host rather
 * than to an account, so the caller must be the operator, not merely signed in.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  const auth = await requireOperator(request.headers.get("authorization"), "projects");
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
    projectsRoot(); // fail fast with a clear message if it isn't configured
  } catch (err) {
    return NextResponse.json({
      ok: false,
      message: err instanceof Error ? err.message : "Projects root is not configured",
    });
  }

  try {
    switch (name) {
      case "start_website_build":
        return NextResponse.json(
          await startWebsiteBuild({
            client: args.client,
            project_name: args.project_name,
            company: args.company,
            website: args.website,
            contact: args.contact,
            email: args.email,
            requirements: args.requirements,
            notes: args.notes,
            stack: args.stack,
          })
        );

      default:
        return NextResponse.json({ ok: false, message: `Unknown project tool "${name}"` });
    }
  } catch (err) {
    // Raw errors carry absolute paths and this result reaches the model.
    console.error(`[jarvis] project tool "${name}" failed:`, err);
    return NextResponse.json({
      ok: false,
      error: "project_error",
      message: "The project operation failed. See the server logs for details.",
    });
  }
}
