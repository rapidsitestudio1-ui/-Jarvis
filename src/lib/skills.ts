/**
 * Skills — reusable playbooks Jarvis follows, stored as Markdown in the vault.
 *
 * The mechanism mirrors how coding agents handle skills: only each skill's
 * name and description are put in the session prompt, and the body is loaded
 * on demand with read_vault_note. That keeps the prompt small no matter how
 * many skills exist, and it means you author and edit them in Obsidian rather
 * than in code.
 *
 * Two layouts are recognised, so skills written here and skills cloned from
 * the wider ecosystem both work:
 *
 *   Skills/website-build.md                      flat — one file per skill
 *   Skills/<anything>/.../<skill-name>/SKILL.md  the Agent Skills standard
 *
 * Both need frontmatter with `name` and `description`. Nested `SKILL.md` is
 * matched by filename, so a standard skill's `references/*.md` and
 * `assets/*.md` are correctly ignored rather than mistaken for skills.
 */

import fs from "node:fs/promises";
import path from "node:path";

export const SKILLS_FOLDER = "Skills";

/** Depth allows a cloned repo: Skills/<repo>/skills/<skill>/SKILL.md */
const MAX_SKILL_DEPTH = 4;
/** The index goes in every session prompt, so it has to stay bounded. */
const MAX_SKILLS = 60;
const MAX_DESCRIPTION = 220;
const SKIP_DIRS = new Set(["node_modules", "scripts", "assets", ".git"]);

export type SkillSummary = { name: string; description: string; path: string };

/** Minimal frontmatter reader — only the two scalar keys we care about. */
function parseFrontmatter(text: string): Record<string, string> {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = text.slice(3, end);
  const out: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    out[match[1].toLowerCase()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

type Candidate = { abs: string; rel: string; standard: boolean };

async function collect(dir: string, rel: string, depth: number, out: Candidate[]): Promise<void> {
  if (depth > MAX_SKILL_DEPTH || out.length >= MAX_SKILLS * 4) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      await collect(abs, relPath, depth + 1, out);
      continue;
    }
    if (!entry.isFile()) continue;

    const lower = entry.name.toLowerCase();
    // Nested: only SKILL.md counts, so references/ and docs are not skills.
    if (lower === "skill.md") {
      out.push({ abs, rel: relPath, standard: true });
      continue;
    }
    // Flat: any .md sitting directly in Skills/, except the folder's own README.
    if (depth === 0 && lower.endsWith(".md") && lower !== "readme.md") {
      out.push({ abs, rel: relPath, standard: false });
    }
  }
}

/**
 * List the skills available in the vault. Returns an empty array rather than
 * throwing — a missing vault or Skills folder simply means no skills, and must
 * never block a Realtime session from starting.
 */
export async function listSkills(): Promise<SkillSummary[]> {
  const root = process.env.OBSIDIAN_VAULT_PATH;
  if (!root || !root.trim()) return [];

  const base = path.join(path.resolve(root.trim()), SKILLS_FOLDER);
  const candidates: Candidate[] = [];
  await collect(base, "", 0, candidates);

  const skills: SkillSummary[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    let text = "";
    try {
      text = await fs.readFile(candidate.abs, "utf8");
    } catch {
      continue;
    }
    const fm = parseFrontmatter(text);
    const description = (fm.description ?? "").trim();
    // Description is the only routing signal, so a skill without one is unusable.
    if (!description) continue;

    // The standard names a skill after its directory; flat skills after the file.
    const fallback = candidate.standard
      ? path.basename(path.dirname(candidate.abs))
      : path.basename(candidate.rel, path.extname(candidate.rel));
    const name = (fm.name || fallback).trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    skills.push({
      name,
      description:
        description.length > MAX_DESCRIPTION
          ? `${description.slice(0, MAX_DESCRIPTION).trimEnd()}…`
          : description,
      path: `${SKILLS_FOLDER}/${candidate.rel}`,
    });
  }

  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}

/** The block injected into the Realtime session instructions. */
export function renderSkillIndex(skills: SkillSummary[]): string {
  if (skills.length === 0) return "";
  // Hard cap: a cloned collection can hold hundreds, and every one of these
  // lines is spent on every session.
  const shown = skills.slice(0, MAX_SKILLS);
  const lines = shown.map((s) => `- ${s.name} — ${s.description} (read: ${s.path})`);
  const overflow =
    skills.length > shown.length
      ? `\n(${skills.length - shown.length} further skills exist but are not listed; use "list_vault_notes" on the Skills folder to find them.)`
      : "";
  return `\n\nSkills available in the vault. These are the user's own playbooks; when one matches the request, call "read_vault_note" with its path and follow it before acting. Do not guess a procedure a skill already documents. If a skill's steps require a capability you do not have — running a script or a shell command — say so instead of pretending to follow it.\n${lines.join("\n")}${overflow}`;
}
