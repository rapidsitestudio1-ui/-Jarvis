/**
 * Client website scaffolding. Server-side only — like the vault tools, this
 * touches local disk and so runs in the Next.js process, not in Convex.
 *
 * The job here is not to build the site. It is to create the folder and write
 * the brief an agentic editor (Antigravity, Claude Code, Cursor) reads on
 * open, so the coding agent starts with the client context already loaded.
 */

import fs from "node:fs/promises";
import path from "node:path";

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function projectsRoot(): string {
  const root = process.env.PROJECTS_ROOT;
  if (!root || !root.trim()) {
    throw new Error("PROJECTS_ROOT is not set in .env.local");
  }
  return path.resolve(root.trim());
}

async function canonicalRoot(): Promise<string> {
  const root = projectsRoot();
  try {
    return await fs.realpath(root);
  } catch {
    return root;
  }
}

function escapes(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return rel !== "" && (rel.startsWith("..") || path.isAbsolute(rel));
}

/** Turn a spoken client name into one safe directory segment. */
export function toFolderName(name: string): string {
  const printable = Array.from(name ?? "")
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  const cleaned = printable
    .replace(ILLEGAL_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (!cleaned) return "";
  if (WINDOWS_RESERVED.test(cleaned)) return `${cleaned} site`;
  return cleaned.slice(0, 80);
}

/** Resolve one directory directly under the projects root, never deeper. */
async function resolveProjectDir(folder: string): Promise<string> {
  const root = await canonicalRoot();
  const target = path.resolve(root, folder);
  if (escapes(root, target) || path.dirname(target) !== root) {
    throw new Error("Refused: project folder must sit directly inside the projects root");
  }
  return target;
}

function agentsMd(o: {
  client: string;
  project: string;
  company?: string;
  website?: string;
  contact?: string;
  email?: string;
  stack: string;
  requirements?: string;
  notes?: string;
}): string {
  return `# ${o.project}

Website build for **${o.client}**${o.company && o.company !== o.client ? ` (${o.company})` : ""}.

## Client

| | |
|---|---|
| Client | ${o.client} |
${o.company ? `| Company | ${o.company} |\n` : ""}${o.contact ? `| Contact | ${o.contact} |\n` : ""}${o.email ? `| Email | ${o.email} |\n` : ""}${o.website ? `| Existing site | ${o.website} |\n` : ""}
## Requirements

${o.requirements?.trim() || "_Not yet captured. Ask before building._"}

${o.notes?.trim() ? `## Notes\n\n${o.notes.trim()}\n` : ""}
## Stack

${o.stack}

## Conventions for the coding agent

- Read this file first. It is the brief; treat it as the source of truth for scope.
- Ask before adding dependencies beyond the stack above.
- Mobile-first. The client's customers arrive on phones.
- Real copy over lorem ipsum — draft plausible content from the client context above.
- Accessible by default: semantic landmarks, labelled controls, visible focus, AA contrast.
- Do not commit secrets. Environment values belong in \`.env.local\`, which is gitignored.

_Scaffolded by Jarvis. Edit freely — this file is meant to be refined as the build proceeds._
`;
}

export async function startWebsiteBuild(args: {
  client: string;
  project_name?: string;
  company?: string;
  website?: string;
  contact?: string;
  email?: string;
  requirements?: string;
  notes?: string;
  stack?: string;
}) {
  const client = String(args.client ?? "").trim();
  if (!client) {
    return { ok: false as const, message: "Which client is this site for?" };
  }

  // A path-shaped name means the caller is confused. Stripping the separators
  // would silently invent a folder ("sub/nested" -> "subnested"), which is safe
  // but not what anyone asked for. Refuse and say so.
  const requested = String(args.project_name || client);
  if (/[/\\]/.test(requested)) {
    return {
      ok: false as const,
      error: "invalid_name",
      message: `"${requested}" looks like a path. Give a plain project name — it becomes one folder directly inside the projects root.`,
    };
  }

  const folder = toFolderName(requested);
  if (!folder) {
    return { ok: false as const, message: `"${client}" doesn't reduce to a usable folder name.` };
  }

  const root = await canonicalRoot();
  await fs.mkdir(root, { recursive: true });
  const dir = await resolveProjectDir(folder);

  // These folders hold real client work — never write into an existing one.
  try {
    const existing = await fs.readdir(dir);
    return {
      ok: false as const,
      error: "already_exists",
      message: `"${folder}" already exists in the projects root${
        existing.length ? ` and is not empty (${existing.length} entries)` : ""
      }. Pick a different project name, or open the existing one.`,
      path: folder,
    };
  } catch {
    /* does not exist — good, carry on */
  }

  const project = args.project_name?.trim() || `${client} Website`;
  const stack = args.stack?.trim() || "Next.js (App Router) + TypeScript + Tailwind CSS";

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "AGENTS.md"),
    agentsMd({
      client,
      project,
      company: args.company,
      website: args.website,
      contact: args.contact,
      email: args.email,
      stack,
      requirements: args.requirements,
      notes: args.notes,
    }),
    "utf8"
  );
  await fs.writeFile(
    path.join(dir, ".gitignore"),
    ["node_modules/", ".next/", "out/", ".env*", ".DS_Store", "*.tsbuildinfo", ""].join("\n"),
    "utf8"
  );

  return {
    ok: true as const,
    client,
    project,
    stack,
    path: folder,
    absolute_path: dir,
    files: ["AGENTS.md", ".gitignore"],
    next_step:
      "Open this folder in the editor. The coding agent should read AGENTS.md, then scaffold the app itself.",
  };
}
