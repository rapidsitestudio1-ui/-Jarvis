/**
 * Local Obsidian vault access. Server-side only — this touches the filesystem,
 * so it runs in the Next.js process (which lives on the user's machine),
 * not in Convex actions.
 *
 * Every path is resolved to its canonical form and checked against the vault
 * root before use, so neither a model-supplied path nor a symlink inside the
 * vault can reach outside it.
 */

import fs from "node:fs/promises";
import path from "node:path";

const MAX_SCAN_FILES = 3000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_DEPTH = 12;
/** Ceiling on bytes read per search, so a large vault can't stall a request. */
const MAX_SEARCH_BYTES = 8 * 1024 * 1024;
/** Concurrent fs.stat calls per batch in listNotes. */
const STAT_BATCH = 64;
const SKIP_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules"]);
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*]/g;

export function vaultRoot(): string {
  const root = process.env.OBSIDIAN_VAULT_PATH;
  if (!root || !root.trim()) {
    throw new Error("OBSIDIAN_VAULT_PATH is not set in .env.local");
  }
  return path.resolve(root.trim());
}

/** The vault root with symlinks resolved, so containment compares like for like. */
async function canonicalRoot(): Promise<string> {
  const root = vaultRoot();
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

/**
 * Resolve a vault-relative path, refusing anything that escapes the root.
 *
 * The string check alone is not enough: a symlink inside the vault could point
 * outside it and still look contained. So the target is canonicalised with
 * realpath before the check. Paths that don't exist yet (creates) are checked
 * against their nearest existing ancestor instead.
 */
async function resolveInVault(relPath: string): Promise<string> {
  const root = await canonicalRoot();
  const target = path.resolve(root, relPath);

  // Cheap textual rejection first, before touching the disk.
  if (escapes(root, target)) {
    throw new Error("Refused: path escapes the vault");
  }

  const missing: string[] = [];
  let probe = target;
  for (;;) {
    let real: string;
    try {
      real = await fs.realpath(probe);
    } catch {
      const parent = path.dirname(probe);
      if (parent === probe) throw new Error("Refused: path escapes the vault");
      missing.push(path.basename(probe));
      probe = parent;
      continue;
    }
    if (escapes(root, real)) {
      throw new Error("Refused: path escapes the vault");
    }
    return missing.length ? path.join(real, ...missing.reverse()) : real;
  }
}

async function toRelative(absPath: string): Promise<string> {
  const root = await canonicalRoot();
  return path.relative(root, absPath).split(path.sep).join("/");
}

/** Strip control characters and anything illegal in a Windows filename. */
function sanitizeSegment(segment: string): string {
  const printable = Array.from(segment ?? "")
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
  if (!cleaned) return "Untitled";
  if (WINDOWS_RESERVED.test(cleaned)) return `${cleaned} note`;
  return cleaned.slice(0, 120);
}

/**
 * Sanitize a folder path segment by segment, e.g. "Clients/Acme Corp".
 *
 * Hidden and skipped segments are dropped before sanitising, since
 * sanitizeSegment only strips *trailing* dots — ".obsidian" would otherwise
 * survive intact and let a caller write into, or enumerate, the very
 * directories walk() and isVisibleNotePath() exist to keep out of reach.
 */
function sanitizeFolder(folder: string | undefined): string {
  if (!folder) return "";
  return folder
    .split(/[/\\]+/)
    .filter((raw) => {
      const segment = raw.trim();
      return segment !== "" && !segment.startsWith(".") && !SKIP_DIRS.has(segment);
    })
    .map((s) => sanitizeSegment(s))
    .filter((s) => s && s !== "Untitled")
    .join("/");
}

/** Clamp a caller-supplied count to a usable integer, so slice() can't invert. */
function normalizeLimit(value: unknown, fallback: number, cap: number): number {
  const n = Number(value);
  if (value === undefined || value === null || !Number.isFinite(n)) return fallback;
  return Math.min(cap, Math.max(1, Math.trunc(n)));
}

async function walk(dir: string, out: string[] = [], depth = 0): Promise<string[]> {
  if (out.length >= MAX_SCAN_FILES || depth > MAX_DEPTH) return out;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (out.length >= MAX_SCAN_FILES) break;
    if (entry.name.startsWith(".") || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out, depth + 1);
    } else if (entry.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

async function readCapped(absPath: string): Promise<string> {
  const stat = await fs.stat(absPath);
  if (stat.size > MAX_FILE_BYTES) {
    const handle = await fs.open(absPath, "r");
    try {
      const buf = Buffer.alloc(MAX_FILE_BYTES);
      // Decode only what was actually read. The buffer is zero-filled, so if
      // the file shrank since stat() the tail would decode as NUL characters
      // and end up in search results and model output.
      const { bytesRead } = await handle.read(buf, 0, MAX_FILE_BYTES, 0);
      return buf.subarray(0, bytesRead).toString("utf8") + "\n\n…[truncated]";
    } finally {
      await handle.close();
    }
  }
  return await fs.readFile(absPath, "utf8");
}

/**
 * The same filter `walk` applies, for paths that arrive directly rather than
 * by scanning. Without it a caller could name `.obsidian/app.json` and reach
 * a file that search and list deliberately hide — reading Obsidian's own
 * config, or worse, appending Markdown into it and corrupting it.
 */
function isVisibleNotePath(relPath: string): boolean {
  if (!relPath.toLowerCase().endsWith(".md")) return false;
  return relPath
    .split("/")
    .filter(Boolean)
    .every((segment) => !segment.startsWith(".") && !SKIP_DIRS.has(segment));
}

type NoteMatch = { file: string | null; candidates?: string[] };

/**
 * Find a note by vault-relative path or title.
 *
 * `strict` is for write paths: it never guesses. Anything short of a direct
 * path or a single exact title match comes back as a candidate list for the
 * caller to confirm, so an append can't silently land in the wrong note.
 */
async function findNote(query: string, opts: { strict?: boolean } = {}): Promise<NoteMatch> {
  const needle = (query ?? "").trim();
  if (!needle) return { file: null };

  // Try it as a direct path first (with and without the .md extension).
  for (const candidate of [needle, needle.endsWith(".md") ? needle : `${needle}.md`]) {
    try {
      const abs = await resolveInVault(candidate);
      if (!isVisibleNotePath(await toRelative(abs))) continue;
      const stat = await fs.stat(abs);
      if (stat.isFile()) return { file: abs };
    } catch {
      /* not a direct path — fall through to title matching */
    }
  }

  const files = await walk(await canonicalRoot());
  const lower = needle.toLowerCase().replace(/\.md$/, "");
  const byName = (f: string) => path.basename(f, ".md").toLowerCase();

  const exact = files.filter((f) => byName(f) === lower);
  if (exact.length === 1) return { file: exact[0] };
  if (exact.length > 1) return { file: null, candidates: exact };

  const partial = files.filter((f) => byName(f).includes(lower) || lower.includes(byName(f)));

  if (opts.strict) {
    return partial.length > 0 ? { file: null, candidates: partial } : { file: null };
  }

  if (partial.length > 0) return { file: partial[0] };

  // Word-overlap fallback, mirroring the fuzzy matching used for to-dos.
  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  let best: { file: string; score: number } | undefined;
  for (const f of files) {
    const hay = byName(f);
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { file: f, score };
  }
  return { file: best?.file ?? null };
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

export async function listNotes(args: { folder?: string; max_results?: number }) {
  const folder = sanitizeFolder(args.folder);
  const base = folder ? await resolveInVault(folder) : await canonicalRoot();
  const files = await walk(base);
  const limit = normalizeLimit(args.max_results, 50, 200);

  // Bounded concurrency: a large vault shouldn't open thousands of stats at once.
  const withTimes: { path: string; title: string; modified: number }[] = [];
  for (let i = 0; i < files.length; i += STAT_BATCH) {
    const batch = await Promise.all(
      files.slice(i, i + STAT_BATCH).map(async (f) => {
        let modified = 0;
        try {
          modified = (await fs.stat(f)).mtimeMs;
        } catch {
          /* ignore */
        }
        return { path: await toRelative(f), title: path.basename(f, ".md"), modified };
      })
    );
    withTimes.push(...batch);
  }
  withTimes.sort((a, b) => b.modified - a.modified);

  return {
    ok: true as const,
    total: withTimes.length,
    notes: withTimes.slice(0, limit).map(({ path: p, title }) => ({ path: p, title })),
  };
}

export async function searchVault(args: { query?: string; max_results?: number }) {
  const query = (args.query ?? "").trim();
  const limit = normalizeLimit(args.max_results, 8, 25);
  const files = await walk(await canonicalRoot());

  if (files.length === 0) {
    return {
      ok: true as const,
      results: [],
      message: "The vault is empty — no notes have been created yet.",
    };
  }
  if (!query) {
    const recent = await listNotes({ max_results: limit });
    return { ok: true as const, results: recent.notes.map((n) => ({ ...n, snippet: "" })) };
  }

  const lower = query.toLowerCase();
  const words = lower.split(/\s+/).filter((w) => w.length > 2);
  const scored: { path: string; title: string; snippet: string; score: number }[] = [];

  // Titles are always scored (free); bodies are read only while budget remains.
  let budget = MAX_SEARCH_BYTES;
  let bodiesTruncated = false;

  for (const file of files) {
    const title = path.basename(file, ".md");
    const hayTitle = title.toLowerCase();

    let score = 0;
    if (hayTitle === lower) score += 100;
    else if (hayTitle.includes(lower)) score += 50;
    score += words.filter((w) => hayTitle.includes(w)).length * 10;

    let content = "";
    if (budget > 0) {
      try {
        content = await readCapped(file);
        budget -= Buffer.byteLength(content, "utf8");
      } catch {
        content = "";
      }
      const hayBody = content.toLowerCase();
      if (hayBody.includes(lower)) score += 8;
      score += words.filter((w) => hayBody.includes(w)).length;
    } else {
      bodiesTruncated = true;
    }

    if (score === 0) continue;

    const hayBody = content.toLowerCase();
    const at = content ? hayBody.indexOf(words[0] ?? lower) : -1;
    const snippet = !content
      ? ""
      : at >= 0
        ? content
            .slice(Math.max(0, at - 100), Math.min(content.length, at + 200))
            .replace(/\s+/g, " ")
            .trim()
        : content.slice(0, 200).replace(/\s+/g, " ").trim();

    scored.push({ path: await toRelative(file), title, snippet, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return {
    ok: true as const,
    results: scored.slice(0, limit).map((r) => ({ path: r.path, title: r.title, snippet: r.snippet })),
    ...(bodiesTruncated
      ? { partial: true, note: "Vault too large to full-text scan; some notes matched on title only." }
      : {}),
  };
}

export async function readVaultNote(args: { path?: string; title?: string }) {
  const query = args.path ?? args.title ?? "";
  const { file } = await findNote(query);
  if (!file) {
    return { ok: false as const, message: `No note matching "${query}" found in the vault.` };
  }
  const content = await readCapped(file);
  return {
    ok: true as const,
    path: await toRelative(file),
    title: path.basename(file, ".md"),
    content: content.slice(0, 20000),
  };
}

export async function createVaultNote(args: {
  title: string;
  content?: string;
  folder?: string;
  tags?: string[];
}) {
  const title = sanitizeSegment(args.title ?? "");
  const folder = sanitizeFolder(args.folder);
  const dir = folder ? await resolveInVault(folder) : await canonicalRoot();
  await fs.mkdir(dir, { recursive: true });

  const tags = (args.tags ?? []).map((t) => t.replace(/[^\w/-]/g, "-")).filter(Boolean);
  const body = (args.content ?? "").trim();
  const render = (heading: string) =>
    [
      "---",
      `created: ${new Date().toISOString()}`,
      tags.length ? `tags: [${tags.join(", ")}]` : null,
      "source: jarvis",
      "---",
      "",
    ]
      .filter((line) => line !== null)
      .join("\n") + `# ${heading}\n\n${body}\n`;

  // Exclusive create: 'wx' fails if the file exists, so an existing note can
  // never be clobbered — including by a concurrent create racing this one.
  let finalTitle = title;
  for (let n = 2; n <= 100; n++) {
    const target = await resolveInVault(path.join(folder, `${finalTitle}.md`));
    try {
      await fs.writeFile(target, render(finalTitle), { encoding: "utf8", flag: "wx" });
      return { ok: true as const, path: await toRelative(target), title: finalTitle };
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
      finalTitle = `${title} ${n}`;
    }
  }
  return {
    ok: false as const,
    message: `Too many notes already titled "${title}". Pick a more specific title.`,
  };
}

export async function appendVaultNote(args: {
  path?: string;
  title?: string;
  content: string;
  heading?: string;
}) {
  const content = (args.content ?? "").trim();
  if (!content) {
    return { ok: false as const, message: "Nothing to append — the content was empty." };
  }

  const query = args.path ?? args.title ?? "";
  // Strict: writes never guess which note was meant.
  const { file, candidates } = await findNote(query, { strict: true });
  if (!file) {
    if (candidates?.length) {
      const names = await Promise.all(candidates.slice(0, 8).map((c) => toRelative(c)));
      return {
        ok: false as const,
        message: `"${query}" matches more than one note. Confirm which: ${names.join(", ")}.`,
        candidates: names,
      };
    }
    return {
      ok: false as const,
      message: `No note matching "${query}" found. Use create_vault_note to make it first.`,
    };
  }

  const heading = args.heading?.trim();
  // Local time — this heading is a human-facing log entry, not a UTC record.
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
  const block = ["", heading ? `## ${heading}` : `## ${stamp}`, "", content, ""].join("\n");

  await fs.appendFile(file, block, "utf8");
  return { ok: true as const, path: await toRelative(file), title: path.basename(file, ".md") };
}
