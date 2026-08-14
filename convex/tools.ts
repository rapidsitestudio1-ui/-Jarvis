"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { getComposio, SERVICES } from "./composio";
import { requireUser } from "./auth";

type ToolResult = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/* Response shaping helpers                                            */
/* ------------------------------------------------------------------ */

// Composio returns loosely-typed data; extract what we can defensively.
/* eslint-disable @typescript-eslint/no-explicit-any */

export function shapeEmails(data: any): {
  count: number;
  emails: { subject: string; from: string; snippet: string; date?: string }[];
} {
  const messages: any[] = data?.messages ?? data?.items ?? (Array.isArray(data) ? data : []);
  const emails = messages.slice(0, 12).map((m: any) => ({
    subject: m.subject ?? m.payload?.subject ?? "(no subject)",
    from: m.sender ?? m.from ?? m.payload?.from ?? "unknown",
    snippet: (m.preview?.body ?? m.snippet ?? m.messageText ?? "").slice(0, 140),
    date: m.messageTimestamp ?? m.date ?? undefined,
  }));
  return { count: messages.length, emails };
}

export function shapeEvents(data: any): {
  count: number;
  events: { title: string; start?: string; end?: string; location?: string; link?: string }[];
} {
  const items: any[] = data?.items ?? data?.events ?? (Array.isArray(data) ? data : []);
  const events = items.slice(0, 12).map((e: any) => ({
    title: e.summary ?? e.title ?? "(untitled)",
    start: e.start?.dateTime ?? e.start?.date ?? e.start ?? undefined,
    end: e.end?.dateTime ?? e.end?.date ?? e.end ?? undefined,
    location: e.location ?? undefined,
    link: e.htmlLink ?? undefined,
  }));
  return { count: items.length, events };
}

export function shapeNotes(data: any): {
  count: number;
  notes: { id?: string; title: string; url?: string; lastEdited?: string; isDatabase?: boolean }[];
} {
  const results: any[] = data?.results ?? data?.items ?? (Array.isArray(data) ? data : []);
  const notes = results.slice(0, 10).map((r: any) => {
    const titleProp =
      r.properties?.title?.title ?? r.properties?.Name?.title ?? r.title ?? [];
    const title = Array.isArray(titleProp)
      ? titleProp.map((t: any) => t.plain_text ?? "").join("") || "(untitled)"
      : String(titleProp ?? "(untitled)");
    return {
      id: r.id ?? undefined,
      title,
      url: r.url ?? undefined,
      lastEdited: r.last_edited_time ?? undefined,
      isDatabase: r.object === "database" || undefined,
    };
  });
  return { count: results.length, notes };
}

/* ------------------------------------------------------------------ */
/* Linear helpers                                                      */
/* ------------------------------------------------------------------ */

// Linear encodes priority as an integer; the model speaks in words.
const LINEAR_PRIORITY: Record<string, number> = {
  none: 0,
  urgent: 1,
  high: 2,
  normal: 3,
  medium: 3,
  low: 4,
};
const LINEAR_PRIORITY_LABEL: Record<number, string> = {
  0: "none",
  1: "urgent",
  2: "high",
  3: "normal",
  4: "low",
};

export function toLinearPriority(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input === "number") return input >= 0 && input <= 4 ? input : undefined;
  const s = String(input).toLowerCase().trim();
  return LINEAR_PRIORITY[s];
}

/** Linear's API wants due dates as 'YYYY,MM,DD,hh,mm,ss', not ISO. */
export function toLinearDate(input: unknown): string | undefined {
  if (!input) return undefined;
  const d = new Date(String(input));
  if (isNaN(d.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    p(d.getMonth() + 1),
    p(d.getDate()),
    p(d.getHours()),
    p(d.getMinutes()),
    p(d.getSeconds()),
  ].join(",");
}

/**
 * Pick the first array that actually has entries.
 *
 * Composio's Linear responses carry the same collection under two keys and
 * leave the unused one as an empty array — e.g. `{items: [], teams: [...]}`.
 * `a ?? b` is wrong here: `[]` is neither null nor undefined, so it wins and
 * the populated key is never read.
 */
function firstNonEmpty(...candidates: unknown[]): any[] {
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  return [];
}

/** Loose name matching, so the user can say "acme" and hit "Acme Corp". */
export function bestMatch<T>(items: T[], needle: string, nameOf: (t: T) => string): T | undefined {
  const q = (needle ?? "").trim().toLowerCase();
  if (!q || items.length === 0) return undefined;
  const exact = items.find((i) => nameOf(i).toLowerCase() === q);
  if (exact) return exact;
  const partial = items.filter((i) => {
    const n = nameOf(i).toLowerCase();
    return n.includes(q) || q.includes(n);
  });
  if (partial.length > 0) return partial[0];
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  let best: { item: T; score: number } | undefined;
  for (const i of items) {
    const n = nameOf(i).toLowerCase();
    const score = words.filter((w) => n.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { item: i, score };
  }
  return best?.item;
}

/**
 * `limit` bounds the returned set. It must cover the caller's full request —
 * issue matching scans this list, so truncating it would silently hide
 * candidates the caller explicitly asked for.
 */
export function shapeIssues(
  data: any,
  limit = 15
): {
  count: number;
  issues: {
    id?: string;
    key?: string;
    title: string;
    state?: string;
    priority?: string;
    assignee?: string;
    project?: string;
    url?: string;
  }[];
} {
  const items: any[] = firstNonEmpty(
    data?.issues,
    data?.items,
    Array.isArray(data) ? data : []
  );
  const issues = items.slice(0, limit).map((i: any) => ({
    id: i.id ?? undefined,
    key: i.identifier ?? undefined,
    title: i.title ?? i.name ?? "(untitled)",
    state: i.state?.name ?? (typeof i.state === "string" ? i.state : undefined),
    priority:
      typeof i.priority === "number" ? LINEAR_PRIORITY_LABEL[i.priority] : undefined,
    assignee: i.assignee?.name ?? i.assignee?.displayName ?? undefined,
    project: i.project?.name ?? undefined,
    url: i.url ?? undefined,
  }));
  return { count: issues.length, issues };
}

/* ------------------------------------------------------------------ */
/* Airtable helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * Composio nests Airtable's REST payload under `data.response_data`, but some
 * actions return it flat. Unwrap either shape before reading collections.
 */
function airtableBody(data: any): any {
  return data?.response_data ?? data ?? {};
}

/**
 * Record field values can be long (rich text, attachment arrays). This is
 * read aloud and forwarded to the model, so each value is stringified and capped.
 */
export function shapeRecords(
  data: any,
  limit = 10
): {
  count: number;
  records: { id?: string; fields: Record<string, string> }[];
} {
  const body = airtableBody(data);
  const items = firstNonEmpty(body?.records, body?.items, Array.isArray(body) ? body : []);
  const records = items.slice(0, limit).map((r: any) => {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(r?.fields ?? {})) {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      fields[k] = String(s ?? "").slice(0, 200);
    }
    return { id: r?.id ?? undefined, fields };
  });
  return { count: records.length, records };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export const execute = action({
  args: {
    name: v.string(),
    arguments: v.any(),
  },
  handler: async (ctx, { name, arguments: rawArgs }): Promise<ToolResult> => {
    const userId = await requireUser(ctx);
    const args = (rawArgs ?? {}) as any;
    const log = (kind: string, label: string, detail?: string) =>
      ctx.runMutation(api.timeline.log, { kind, label, detail });
    const setObjective = (text: string, state: "idle" | "working" | "waiting_auth" = "working") =>
      ctx.runMutation(api.objective.set, { text, state });

    await log("tool_selected", "Tool selected", name.replace(/_/g, " "));

    const requireConnection = async (toolkit: string): Promise<ToolResult | null> => {
      const connections = await ctx.runQuery(api.connections.list, {});
      const conn = connections.find((c) => c.toolkit === toolkit);
      if (conn?.status === "connected") return null;
      const svc = SERVICES[toolkit];
      return {
        error: "not_connected",
        message: `${svc?.name ?? toolkit} is not connected yet. Offer to connect it — the user just needs to say "connect my ${svc?.name ?? toolkit}".`,
      };
    };

    /* ------------ Linear plumbing ------------ */

    const linearExec = async (slug: string, callArgs: Record<string, unknown>) => {
      const composio = getComposio();
      return await composio.tools.execute(slug, {
        userId: String(userId),
        dangerouslySkipVersionCheck: true,
        arguments: callArgs,
      });
    };

    /**
     * A failed lookup is not an empty workspace. Both return an error result
     * on failure so callers never report "nothing is visible" when the real
     * cause was an auth or transport failure.
     *
     * Neither action accepts pagination arguments, so there is no cursor to
     * follow — LINEAR_GET_ALL_LINEAR_TEAMS and LINEAR_LIST_LINEAR_PROJECTS
     * both take zero parameters and return the full set.
     */
    const linearTeams = async (): Promise<{
      teams?: { id: string; name: string; key?: string }[];
      error?: ToolResult;
    }> => {
      const r = await linearExec("LINEAR_GET_ALL_LINEAR_TEAMS", {});
      if (!r.successful) {
        return {
          error: { error: "tool_failed", message: r.error ?? "Could not list Linear teams" },
        };
      }
      const d = r.data as any;
      return {
        teams: firstNonEmpty(d?.teams, d?.items)
          .filter((t: any) => t?.id)
          .map((t: any) => ({ id: t.id, name: t.name ?? t.key ?? "(unnamed)", key: t.key })),
      };
    };

    const linearProjects = async (): Promise<{
      projects?: { id: string; name: string }[];
      error?: ToolResult;
    }> => {
      const r = await linearExec("LINEAR_LIST_LINEAR_PROJECTS", {});
      if (!r.successful) {
        return {
          error: { error: "tool_failed", message: r.error ?? "Could not list Linear projects" },
        };
      }
      const d = r.data as any;
      return {
        projects: firstNonEmpty(d?.projects, d?.items)
          .filter((p: any) => p?.id)
          .map((p: any) => ({ id: p.id, name: p.name ?? "(unnamed)" })),
      };
    };

    /**
     * Resolve a spoken project name to an id. An unmatched name is an error,
     * never a silent fall-through — filing into the wrong project (or none)
     * is worse than refusing.
     */
    const resolveProject = async (
      spoken: unknown
    ): Promise<{ projectId?: string; error?: ToolResult }> => {
      if (!spoken) return {};
      const { projects, error } = await linearProjects();
      if (error) return { error };
      const hit = bestMatch(projects!, String(spoken), (p) => p.name);
      if (!hit) {
        return {
          error: {
            error: "project_not_found",
            message: projects!.length
              ? `No Linear project matching "${spoken}". Options: ${projects!.map((p) => p.name).join(", ")}.`
              : `No Linear project matching "${spoken}" — this workspace has no projects.`,
          },
        };
      }
      return { projectId: hit.id };
    };

    /**
     * Creating an issue requires a team_id, but the user speaks names — and
     * most solo workspaces have exactly one team, so don't make them say it.
     */
    const resolveTeam = async (
      spoken?: string
    ): Promise<{ team?: { id: string; name: string }; error?: ToolResult }> => {
      const { teams: found, error: listErr } = await linearTeams();
      if (listErr) return { error: listErr };
      const teams = found!;
      if (teams.length === 0) {
        return {
          error: {
            error: "no_teams",
            message: "No Linear teams are visible on this account.",
          },
        };
      }
      if (!spoken) {
        if (teams.length === 1) return { team: teams[0] };
        return {
          error: {
            error: "team_ambiguous",
            message: `Which team? Options: ${teams.map((t) => t.name).join(", ")}.`,
          },
        };
      }
      const hit = bestMatch(teams, spoken, (t) => t.name);
      if (!hit) {
        return {
          error: {
            error: "team_not_found",
            message: `No Linear team matching "${spoken}". Options: ${teams.map((t) => t.name).join(", ")}.`,
          },
        };
      }
      return { team: hit };
    };

    /** Find an issue by its Linear key (ACM-12), or loosely by title. */
    const resolveIssue = async (
      spoken: string
    ): Promise<{ issue?: { id: string; title: string; key?: string }; error?: ToolResult }> => {
      const r = await linearExec("LINEAR_LIST_LINEAR_ISSUES", { first: 100 });
      if (!r.successful) {
        return { error: { error: "tool_failed", message: r.error ?? "Could not list issues" } };
      }
      // Match across everything we asked for, not just the display default.
      const { issues } = shapeIssues(r.data, 100);
      const q = spoken.trim().toLowerCase();
      const byKey = issues.find((i) => (i.key ?? "").toLowerCase() === q);
      const hit =
        byKey ??
        (bestMatch(issues, spoken, (i) => i.title) as (typeof issues)[number] | undefined);
      if (!hit?.id) {
        return {
          error: {
            error: "issue_not_found",
            message: `No Linear issue matching "${spoken}".`,
          },
        };
      }
      return { issue: { id: hit.id, title: hit.title, key: hit.key } };
    };

    /* ------------ Airtable plumbing ------------ */

    const airtableExec = async (slug: string, callArgs: Record<string, unknown>) => {
      const composio = getComposio();
      return await composio.tools.execute(slug, {
        userId: String(userId),
        dangerouslySkipVersionCheck: true,
        arguments: callArgs,
      });
    };

    const airtableBases = async (): Promise<{
      bases?: { id: string; name: string }[];
      error?: ToolResult;
    }> => {
      const r = await airtableExec("AIRTABLE_LIST_BASES", {});
      if (!r.successful) {
        return {
          error: { error: "tool_failed", message: r.error ?? "Could not list Airtable bases" },
        };
      }
      const body = airtableBody(r.data);
      return {
        bases: firstNonEmpty(body?.bases, body?.items)
          .filter((b: any) => b?.id)
          .map((b: any) => ({ id: b.id, name: b.name ?? "(unnamed)" })),
      };
    };

    /** Resolve a spoken base name to its appXXXX id. */
    const resolveBase = async (
      spoken: unknown
    ): Promise<{ base?: { id: string; name: string }; error?: ToolResult }> => {
      const { bases, error } = await airtableBases();
      if (error) return { error };
      if (bases!.length === 0) {
        return {
          error: { error: "no_bases", message: "No Airtable bases are visible on this account." },
        };
      }
      // One base is the common case for a small agency — don't make them say it.
      if (!spoken) {
        if (bases!.length === 1) return { base: bases![0] };
        return {
          error: {
            error: "base_ambiguous",
            message: `Which base? Options: ${bases!.map((b) => b.name).join(", ")}.`,
          },
        };
      }
      const hit = bestMatch(bases!, String(spoken), (b) => b.name);
      if (!hit) {
        return {
          error: {
            error: "base_not_found",
            message: `No Airtable base matching "${spoken}". Options: ${bases!.map((b) => b.name).join(", ")}.`,
          },
        };
      }
      return { base: hit };
    };

    const airtableTables = async (
      baseId: string
    ): Promise<{
      tables?: { id: string; name: string; fields: string[] }[];
      error?: ToolResult;
    }> => {
      const r = await airtableExec("AIRTABLE_GET_BASE_SCHEMA", { baseId });
      if (!r.successful) {
        return {
          error: { error: "tool_failed", message: r.error ?? "Could not read the base schema" },
        };
      }
      const body = airtableBody(r.data);
      return {
        tables: firstNonEmpty(body?.tables, body?.items)
          .filter((t: any) => t?.id || t?.name)
          .map((t: any) => ({
            id: t.id ?? t.name,
            name: t.name ?? "(unnamed)",
            fields: (t.fields ?? []).map((f: any) => f?.name).filter(Boolean),
          })),
      };
    };

    /**
     * Airtable accepts a table name or id, but resolving first lets the user
     * say "clients" and hit "Clients", and surfaces the real options on a miss.
     */
    const resolveTable = async (
      baseId: string,
      spoken: unknown
    ): Promise<{ table?: { id: string; name: string; fields: string[] }; error?: ToolResult }> => {
      const { tables, error } = await airtableTables(baseId);
      if (error) return { error };
      if (tables!.length === 0) {
        return { error: { error: "no_tables", message: "That base has no tables." } };
      }
      if (!spoken) {
        if (tables!.length === 1) return { table: tables![0] };
        return {
          error: {
            error: "table_ambiguous",
            message: `Which table? Options: ${tables!.map((t) => t.name).join(", ")}.`,
          },
        };
      }
      const hit = bestMatch(tables!, String(spoken), (t) => t.name);
      if (!hit) {
        return {
          error: {
            error: "table_not_found",
            message: `No table matching "${spoken}". Options: ${tables!.map((t) => t.name).join(", ")}.`,
          },
        };
      }
      return { table: hit };
    };

    const finish = async (result: ToolResult, objectiveDone = "Standing by") => {
      await log("results", "Results retrieved", name.replace(/_/g, " "));
      await setObjective(objectiveDone, "idle");
      return result;
    };

    try {
      switch (name) {
        /* ---------------- memory ---------------- */
        case "remember": {
          await setObjective("Updating memory");
          const { updated } = await ctx.runMutation(api.memory.remember, {
            category: args.category ?? "fact",
            key: String(args.key ?? "").trim() || "note",
            value: String(args.value ?? ""),
            source: "conversation",
          });
          await log("memory_updated", updated ? "Memory updated" : "Memory saved", `${args.key}: ${args.value}`);
          return finish({ ok: true, action: updated ? "updated" : "saved" });
        }

        case "recall": {
          await setObjective("Recalling memory");
          const facts = await ctx.runQuery(api.memory.list, {});
          const shaped = facts.map((f) => ({ category: f.category, key: f.key, value: f.value }));
          return finish({ facts: shaped, count: shaped.length });
        }

        case "forget": {
          await setObjective("Updating memory");
          const { forgotten } = await ctx.runMutation(api.memory.forget, {
            key: String(args.key ?? ""),
          });
          await log("memory_updated", forgotten ? "Memory removed" : "Nothing to forget", args.key);
          return finish({ ok: forgotten });
        }

        /* ---------------- todos (native, Convex-backed) ---------------- */
        case "add_todo": {
          await setObjective("Adding to-do");
          const dueAt = parseDueDate(args.due_date);
          const res = await ctx.runMutation(api.todos.add, {
            title: String(args.title ?? "Untitled to-do"),
            priority: normalizePriority(args.priority),
            dueAt,
            notes: args.notes ? String(args.notes) : undefined,
          });
          await log("completed", "To-do added", String(args.title));
          return finish({ ok: true, id: res.id, title: args.title, dueAt });
        }

        case "complete_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.complete, {
            title: String(args.title ?? ""),
          });
          if (res.ok) await log("completed", "To-do completed", res.title);
          return finish(res);
        }

        case "update_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.update, {
            title: String(args.title ?? ""),
            newTitle: args.new_title ? String(args.new_title) : undefined,
            priority: args.priority ? normalizePriority(args.priority) : undefined,
            dueAt: parseDueDate(args.due_date),
            notes: args.notes ? String(args.notes) : undefined,
            reopen: args.reopen === true,
          });
          if (res.ok) await log("completed", "To-do updated", res.title);
          return finish(res);
        }

        case "delete_todo": {
          await setObjective("Updating to-dos");
          const res = await ctx.runMutation(api.todos.remove, {
            title: String(args.title ?? ""),
          });
          if (res.ok) await log("completed", "To-do removed", res.title);
          return finish(res);
        }

        case "list_todos": {
          await setObjective("Reviewing to-dos");
          const { pending, done } = await ctx.runQuery(api.todos.list, {});
          return finish({
            pending: pending.map((t) => ({
              title: t.title,
              priority: t.priority,
              due: t.dueAt ? new Date(t.dueAt).toISOString() : undefined,
              notes: t.notes,
            })),
            recentlyDone: done.slice(0, 5).map((t) => t.title),
          });
        }

        /* ---------------- services ---------------- */
        case "list_services": {
          const connections = await ctx.runQuery(api.connections.list, {});
          return finish({
            services: Object.entries(SERVICES).map(([slug, svc]) => ({
              service: svc.name,
              slug,
              description: svc.description,
              status: connections.find((c) => c.toolkit === slug)?.status ?? "available",
            })),
          });
        }

        case "connect_service": {
          const slug = resolveServiceSlug(String(args.service ?? ""));
          if (!slug) {
            return {
              error: "unknown_service",
              message: `I can connect: ${Object.values(SERVICES).map((s) => s.name).join(", ")}.`,
            };
          }
          const res: any = await ctx.runAction(api.composio.initiateConnection, { toolkit: slug });
          if (!res.ok) return { error: "connection_failed", message: res.error };
          return {
            ok: true,
            status: "pending_auth",
            message: `An authentication window is opening for ${res.service}. Tell the user to complete sign-in there; you'll be notified when it succeeds.`,
          };
        }

        /* ---------------- gmail ---------------- */
        case "get_emails": {
          const blocked = await requireConnection("gmail");
          if (blocked) return blocked;
          await setObjective("Reading inbox");
          await log("executing", "Executing action", "Fetching Gmail messages");
          const composio = getComposio();
          const result = await composio.tools.execute("GMAIL_FETCH_EMAILS", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              query: args.query ?? "is:unread",
              max_results: args.max_results ?? 10,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeEmails(result.data);
          await ctx.runMutation(api.dashboard.setCard, {
            key: "emails",
            data: {
              unread: shaped.count,
              important: shaped.emails.slice(0, 4),
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "gmail" });
          return finish(shaped);
        }

        case "send_email": {
          const blocked = await requireConnection("gmail");
          if (blocked) return blocked;
          const to = String(args.to ?? "").trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            return {
              error: "invalid_recipient",
              message: `"${to}" doesn't look like a valid email address. Ask the user to spell it out.`,
            };
          }
          await setObjective("Sending email");
          await log("executing", "Executing action", `Sending email to ${to}`);
          const composio = getComposio();
          const result = await composio.tools.execute("GMAIL_SEND_EMAIL", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              recipient_email: to,
              subject: args.subject ?? "",
              body: args.body ?? "",
              cc: args.cc ?? undefined,
              is_html: false,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Email sent", `To ${to}: "${String(args.subject ?? "").slice(0, 60)}"`);
          await ctx.runMutation(api.connections.touchSync, { toolkit: "gmail" });
          return finish({ ok: true, to, subject: args.subject });
        }

        /* ---------------- calendar ---------------- */
        case "get_calendar_events": {
          const blocked = await requireConnection("googlecalendar");
          if (blocked) return blocked;
          await setObjective("Scanning calendar");
          await log("executing", "Executing action", "Listing calendar events");
          const composio = getComposio();
          const now = new Date();
          const endOfDay = new Date(now);
          endOfDay.setHours(23, 59, 59, 999);
          const result = await composio.tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              calendar_id: "primary",
              time_min: args.time_min ?? now.toISOString(),
              time_max: args.time_max ?? endOfDay.toISOString(),
              single_events: true,
              order_by: "startTime",
              max_results: args.max_results ?? 15,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeEvents(result.data);
          await ctx.runMutation(api.dashboard.setCard, {
            key: "calendar",
            data: {
              todayCount: shaped.count,
              nextMeeting: shaped.events[0] ?? null,
              upcoming: shaped.events.slice(0, 5),
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "googlecalendar" });
          return finish(shaped);
        }

        case "create_calendar_event": {
          const blocked = await requireConnection("googlecalendar");
          if (blocked) return blocked;
          await setObjective("Creating calendar event");
          await log("executing", "Executing action", `Creating "${args.summary}"`);
          const composio = getComposio();
          const durationMinutes = Number(args.duration_minutes ?? 30);
          const result = await composio.tools.execute("GOOGLECALENDAR_CREATE_EVENT", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              summary: args.summary ?? "New event",
              description: args.description ?? "Created by Jarvis",
              start_datetime: args.start_datetime,
              event_duration_hour: Math.floor(durationMinutes / 60),
              event_duration_minutes: durationMinutes % 60,
              timezone: args.timezone ?? "UTC",
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Task completed", `Event "${args.summary}" created`);
          const data: any = result.data;
          return finish(
            {
              ok: true,
              title: args.summary,
              link: data?.htmlLink ?? data?.response_data?.htmlLink ?? undefined,
            },
            "Standing by"
          );
        }

        /* ---------------- notion ---------------- */
        case "search_notes": {
          const blocked = await requireConnection("notion");
          if (blocked) return blocked;
          await setObjective("Searching notes");
          await log("executing", "Executing action", `Searching Notion for "${args.query ?? ""}"`);
          const composio = getComposio();
          const result = await composio.tools.execute("NOTION_SEARCH_NOTION_PAGE", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: {
              query: args.query ?? "",
              page_size: args.max_results ?? 8,
            },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const shaped = shapeNotes(result.data);
          await ctx.runMutation(api.dashboard.setCard, {
            key: "notes",
            data: {
              recent: shaped.notes.slice(0, 5),
              sources: ["Notion"],
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "notion" });
          return finish(shaped);
        }

        case "read_note": {
          const blocked = await requireConnection("notion");
          if (blocked) return blocked;
          await setObjective("Reading note");
          const composio = getComposio();

          let pageId: string | undefined = args.page_id ? String(args.page_id) : undefined;
          let title: string | undefined = args.title ? String(args.title) : undefined;

          // No id given: resolve via search first.
          if (!pageId) {
            await log("executing", "Executing action", `Locating "${args.query ?? ""}" in Notion`);
            const search = await composio.tools.execute("NOTION_SEARCH_NOTION_PAGE", {
              userId: String(userId),
              dangerouslySkipVersionCheck: true,
              arguments: { query: args.query ?? "", page_size: 5 },
            });
            if (!search.successful) return { error: "tool_failed", message: search.error };
            const shaped = shapeNotes(search.data);
            const page = shaped.notes.find((n) => n.id && !n.isDatabase);
            if (!page) {
              return {
                error: "not_found",
                message: `No Notion page found matching "${args.query}". Try search_notes to see what's available.`,
              };
            }
            pageId = page.id;
            title = page.title;
          }

          await log("executing", "Executing action", `Reading "${title ?? pageId}"`);
          const result = await composio.tools.execute("NOTION_GET_PAGE_MARKDOWN", {
            userId: String(userId),
            dangerouslySkipVersionCheck: true,
            arguments: { page_id: pageId },
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const data: any = result.data;
          const markdown: string =
            data?.markdown ?? data?.content ?? (typeof data === "string" ? data : JSON.stringify(data));
          await ctx.runMutation(api.connections.touchSync, { toolkit: "notion" });
          return finish({
            title,
            page_id: pageId,
            content: markdown.slice(0, 12000),
            truncated: markdown.length > 12000,
          });
        }

        /* ---------------- linear ---------------- */
        case "create_linear_issue": {
          const blocked = await requireConnection("linear");
          if (blocked) return blocked;
          const title = String(args.title ?? "").trim();
          if (!title) {
            return { error: "missing_title", message: "An issue needs a title." };
          }
          await setObjective("Filing Linear issue");
          await log("executing", "Executing action", `Creating issue "${title.slice(0, 60)}"`);

          const { team, error: teamErr } = await resolveTeam(args.team);
          if (teamErr) return teamErr;

          const { projectId, error: projectErr } = await resolveProject(args.project);
          if (projectErr) return projectErr;

          const result = await linearExec("LINEAR_CREATE_LINEAR_ISSUE", {
            team_id: team!.id,
            title,
            description: args.description ?? undefined,
            project_id: projectId,
            priority: toLinearPriority(args.priority),
            due_date: toLinearDate(args.due_date),
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };

          const d = result.data as any;
          await log("completed", "Issue created", `${title.slice(0, 60)} in ${team!.name}`);
          await ctx.runMutation(api.connections.touchSync, { toolkit: "linear" });
          return finish({
            ok: true,
            title: d?.issue_title ?? title,
            team: team!.name,
            url: d?.ticket_url ?? undefined,
          });
        }

        case "list_linear_issues": {
          const blocked = await requireConnection("linear");
          if (blocked) return blocked;
          await setObjective("Reviewing Linear");
          await log("executing", "Executing action", "Listing Linear issues");

          const { projectId, error: projectErr } = await resolveProject(args.project);
          if (projectErr) return projectErr;

          // The model supplies `limit`. A negative value would reach the API
          // and invert the slice in shapeIssues (slice(0, -5) trims from the
          // end), and a fraction would reach the API as-is — so normalise to
          // an integer in 1..100, falling back to 25 when absent or unusable.
          const requested = Number(args.limit);
          const limit =
            args.limit === undefined || args.limit === null || !Number.isFinite(requested)
              ? 25
              : Math.min(100, Math.max(1, Math.trunc(requested)));
          const result = await linearExec("LINEAR_LIST_LINEAR_ISSUES", {
            first: limit,
            project_id: projectId,
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };

          let shaped = shapeIssues(result.data, limit);
          // Linear has no search action here, so filter text client-side.
          const q = String(args.query ?? "").trim().toLowerCase();
          if (q) {
            const hits = shaped.issues.filter(
              (i) =>
                i.title.toLowerCase().includes(q) ||
                (i.key ?? "").toLowerCase().includes(q) ||
                (i.project ?? "").toLowerCase().includes(q)
            );
            shaped = { count: hits.length, issues: hits };
          }
          await ctx.runMutation(api.connections.touchSync, { toolkit: "linear" });
          return finish(shaped);
        }

        case "update_linear_issue": {
          const blocked = await requireConnection("linear");
          if (blocked) return blocked;
          const spoken = String(args.issue ?? "").trim();
          if (!spoken) {
            return { error: "missing_issue", message: "Which issue should I update?" };
          }
          // Without at least one field this is a no-op API call that still
          // reports success — catch it before resolving or writing anything.
          const hasUpdate = [
            args.state,
            args.title,
            args.description,
            args.priority,
            args.due_date,
          ].some((f) => f !== undefined && f !== null && String(f).trim() !== "");
          if (!hasUpdate) {
            return {
              error: "missing_fields",
              message:
                "Nothing to change. Specify a state, title, description, priority, or due date.",
            };
          }

          await setObjective("Updating Linear issue");
          const { issue, error: issueErr } = await resolveIssue(spoken);
          if (issueErr) return issueErr;

          // Workflow states are per-team, so a status change needs the team.
          let stateId: string | undefined;
          if (args.state) {
            const { team, error: teamErr } = await resolveTeam(args.team);
            if (teamErr) return teamErr;
            const statesRes = await linearExec("LINEAR_LIST_LINEAR_STATES", {
              team_id: team!.id,
            });
            // A failed lookup is not "no such state" — don't conflate them.
            if (!statesRes.successful) {
              return {
                error: "tool_failed",
                message: statesRes.error ?? "Could not list Linear workflow states",
              };
            }
            const sd = statesRes.data as any;
            const states = firstNonEmpty(sd?.states, sd?.items).filter((s: any) => s?.id);
            const hit = bestMatch(states, String(args.state), (s: any) => s.name ?? "");
            stateId = (hit as any)?.id;
            if (!stateId) {
              return {
                error: "state_not_found",
                message: `No workflow state matching "${args.state}"${
                  states.length
                    ? `. Options: ${states.map((s: any) => s.name).join(", ")}.`
                    : "."
                }`,
              };
            }
          }

          await log("executing", "Executing action", `Updating ${issue!.key ?? issue!.title}`);
          const result = await linearExec("LINEAR_UPDATE_ISSUE", {
            issue_id: issue!.id,
            title: args.title ?? undefined,
            description: args.description ?? undefined,
            state_id: stateId,
            priority: toLinearPriority(args.priority),
            due_date: toLinearDate(args.due_date),
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Issue updated", issue!.title.slice(0, 60));
          await ctx.runMutation(api.connections.touchSync, { toolkit: "linear" });
          return finish({ ok: true, issue: issue!.title, key: issue!.key });
        }

        case "comment_on_linear_issue": {
          const blocked = await requireConnection("linear");
          if (blocked) return blocked;
          const body = String(args.body ?? "").trim();
          if (!body) return { error: "missing_body", message: "The comment is empty." };
          await setObjective("Commenting on Linear issue");
          const { issue, error: issueErr } = await resolveIssue(String(args.issue ?? ""));
          if (issueErr) return issueErr;

          const result = await linearExec("LINEAR_CREATE_LINEAR_COMMENT", {
            issue_id: issue!.id,
            body,
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Comment added", issue!.title.slice(0, 60));
          await ctx.runMutation(api.connections.touchSync, { toolkit: "linear" });
          return finish({ ok: true, issue: issue!.title, key: issue!.key });
        }

        case "list_linear_projects": {
          const blocked = await requireConnection("linear");
          if (blocked) return blocked;
          await setObjective("Reading Linear projects");
          const [projectsRes, teamsRes] = await Promise.all([linearProjects(), linearTeams()]);
          if (projectsRes.error) return projectsRes.error;
          if (teamsRes.error) return teamsRes.error;
          await ctx.runMutation(api.connections.touchSync, { toolkit: "linear" });
          return finish({
            ok: true,
            projects: projectsRes.projects!.map((p) => p.name),
            teams: teamsRes.teams!.map((t) => t.name),
          });
        }

        /* ---------------- airtable ---------------- */
        case "list_airtable_bases": {
          const blocked = await requireConnection("airtable");
          if (blocked) return blocked;
          await setObjective("Reading Airtable");
          await log("executing", "Executing action", "Listing Airtable bases");
          const { bases, error } = await airtableBases();
          if (error) return error;
          await ctx.runMutation(api.connections.touchSync, { toolkit: "airtable" });
          return finish({ ok: true, count: bases!.length, bases: bases!.map((b) => b.name) });
        }

        case "describe_airtable_base": {
          const blocked = await requireConnection("airtable");
          if (blocked) return blocked;
          await setObjective("Reading Airtable schema");
          const { base, error: baseErr } = await resolveBase(args.base);
          if (baseErr) return baseErr;
          await log("executing", "Executing action", `Reading schema for ${base!.name}`);
          const { tables, error: tableErr } = await airtableTables(base!.id);
          if (tableErr) return tableErr;
          await ctx.runMutation(api.connections.touchSync, { toolkit: "airtable" });
          return finish({
            ok: true,
            base: base!.name,
            tables: tables!.map((t) => ({ table: t.name, fields: t.fields })),
          });
        }

        case "list_airtable_records": {
          const blocked = await requireConnection("airtable");
          if (blocked) return blocked;
          await setObjective("Reading Airtable records");
          const { base, error: baseErr } = await resolveBase(args.base);
          if (baseErr) return baseErr;
          const { table, error: tableErr } = await resolveTable(base!.id, args.table);
          if (tableErr) return tableErr;

          // Airtable caps pageSize at 100; keep the spoken default small.
          const requested = Number(args.limit);
          const limit =
            args.limit === undefined || args.limit === null || !Number.isFinite(requested)
              ? 10
              : Math.min(100, Math.max(1, Math.trunc(requested)));

          await log("executing", "Executing action", `Reading ${table!.name} in ${base!.name}`);
          const result = await airtableExec("AIRTABLE_LIST_RECORDS", {
            baseId: base!.id,
            tableIdOrName: table!.name,
            maxRecords: limit,
            pageSize: limit,
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };

          let shaped = shapeRecords(result.data, limit);
          // Building Airtable formulas from speech is error-prone; filter here.
          const q = String(args.query ?? "").trim().toLowerCase();
          if (q) {
            const hits = shaped.records.filter((r) =>
              Object.values(r.fields).some((v) => v.toLowerCase().includes(q))
            );
            shaped = { count: hits.length, records: hits };
          }
          await ctx.runMutation(api.connections.touchSync, { toolkit: "airtable" });
          return finish({ ok: true, base: base!.name, table: table!.name, ...shaped });
        }

        case "read_airtable_record": {
          const blocked = await requireConnection("airtable");
          if (blocked) return blocked;
          const recordId = String(args.record_id ?? "").trim();
          if (!recordId) {
            return {
              error: "missing_record",
              message:
                "Which record? Call list_airtable_records first and use the id from the result.",
            };
          }
          await setObjective("Reading Airtable record");
          const { base, error: baseErr } = await resolveBase(args.base);
          if (baseErr) return baseErr;
          const { table, error: tableErr } = await resolveTable(base!.id, args.table);
          if (tableErr) return tableErr;

          await log("executing", "Executing action", `Reading a row from ${table!.name}`);
          const result = await airtableExec("AIRTABLE_GET_RECORD", {
            baseId: base!.id,
            tableIdOrName: table!.name,
            recordId,
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };

          // Unlike the list view, a single record keeps its long text intact —
          // that's the whole point of reading one. Cap only to stay under the
          // function-output limit.
          const body = airtableBody(result.data);
          const raw = body?.fields ?? body?.record?.fields ?? {};
          const fields: Record<string, string> = {};
          let budget = 20000;
          for (const [k, v] of Object.entries(raw)) {
            if (budget <= 0) break;
            const s = typeof v === "string" ? v : JSON.stringify(v);
            const value = String(s ?? "").slice(0, budget);
            fields[k] = value;
            budget -= value.length;
          }
          await ctx.runMutation(api.connections.touchSync, { toolkit: "airtable" });
          return finish({
            ok: true,
            base: base!.name,
            table: table!.name,
            record_id: body?.id ?? recordId,
            fields,
          });
        }

        case "create_airtable_record": {
          const blocked = await requireConnection("airtable");
          if (blocked) return blocked;
          const fields = args.fields;
          if (!fields || typeof fields !== "object" || Array.isArray(fields) || !Object.keys(fields).length) {
            return {
              error: "missing_fields",
              message:
                "A record needs at least one field. Call describe_airtable_base first to learn the field names.",
            };
          }
          await setObjective("Adding Airtable record");
          const { base, error: baseErr } = await resolveBase(args.base);
          if (baseErr) return baseErr;
          const { table, error: tableErr } = await resolveTable(base!.id, args.table);
          if (tableErr) return tableErr;

          await log("executing", "Executing action", `Adding a row to ${table!.name}`);
          const result = await airtableExec("AIRTABLE_CREATE_RECORD", {
            baseId: base!.id,
            tableIdOrName: table!.name,
            fields,
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          const body = airtableBody(result.data);
          await log("completed", "Record created", `${table!.name} in ${base!.name}`);
          await ctx.runMutation(api.connections.touchSync, { toolkit: "airtable" });
          return finish({
            ok: true,
            base: base!.name,
            table: table!.name,
            record_id: body?.id ?? body?.record?.id ?? undefined,
          });
        }

        case "update_airtable_record": {
          const blocked = await requireConnection("airtable");
          if (blocked) return blocked;
          const recordId = String(args.record_id ?? "").trim();
          if (!recordId) {
            return {
              error: "missing_record",
              message:
                "Which record? Call list_airtable_records first and use the id from the result.",
            };
          }
          const fields = args.fields;
          if (!fields || typeof fields !== "object" || Array.isArray(fields) || !Object.keys(fields).length) {
            return { error: "missing_fields", message: "Nothing to change — no fields were given." };
          }
          await setObjective("Updating Airtable record");
          const { base, error: baseErr } = await resolveBase(args.base);
          if (baseErr) return baseErr;
          const { table, error: tableErr } = await resolveTable(base!.id, args.table);
          if (tableErr) return tableErr;

          await log("executing", "Executing action", `Updating a row in ${table!.name}`);
          const result = await airtableExec("AIRTABLE_UPDATE_RECORD", {
            baseId: base!.id,
            tableIdOrName: table!.name,
            recordId,
            fields,
          });
          if (!result.successful) return { error: "tool_failed", message: result.error };
          await log("completed", "Record updated", `${table!.name} in ${base!.name}`);
          await ctx.runMutation(api.connections.touchSync, { toolkit: "airtable" });
          return finish({ ok: true, base: base!.name, table: table!.name, record_id: recordId });
        }

        /* ---------------- briefing ---------------- */
        case "prepare_daily_briefing": {
          const briefing: any = await ctx.runAction(api.briefing.run, {});
          return briefing;
        }

        default:
          return { error: "unknown_tool", message: `Tool "${name}" is not implemented.` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await log("error", "Action failed", message.slice(0, 160));
      await setObjective("Standing by", "idle");
      return { error: "execution_error", message };
    }
  },
});

function normalizePriority(input: unknown): "high" | "normal" | "low" {
  const s = String(input ?? "normal").toLowerCase();
  if (s.includes("high") || s.includes("urgent")) return "high";
  if (s.includes("low")) return "low";
  return "normal";
}

function parseDueDate(input: unknown): number | undefined {
  if (!input) return undefined;
  const ts = Date.parse(String(input));
  return isNaN(ts) ? undefined : ts;
}

function resolveServiceSlug(input: string): string | null {
  const s = input.toLowerCase();
  if (s.includes("gmail") || s.includes("mail") || s.includes("email")) return "gmail";
  if (s.includes("calendar")) return "googlecalendar";
  if (s.includes("notion") || s.includes("note")) return "notion";
  if (s.includes("linear") || s.includes("issue") || s.includes("ticket")) return "linear";
  if (s.includes("airtable") || s.includes("air table") || s.includes("base")) return "airtable";
  if (SERVICES[s]) return s;
  return null;
}
