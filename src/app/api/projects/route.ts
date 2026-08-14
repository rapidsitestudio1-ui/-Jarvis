import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { projectsRoot, startWebsiteBuild } from "@/lib/projects";
import { api } from "../../../../convex/_generated/api";

/**
 * Client-project scaffolding. Same reasoning and auth contract as the vault
 * route: Convex actions cannot reach local disk, so this runs in the Next.js
 * process on the operator's machine behind a valid Convex Auth JWT.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  try {
    const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    convex.setAuth(jwt);
    const user = await convex.query(api.auth.me, {});
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

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
