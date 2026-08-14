"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { getComposio } from "./composio";
import { requireUser } from "./auth";
import { shapeEmails, shapeEvents, shapeNotes } from "./tools";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The flagship "prepare me for today" experience. Fans out across every
 * connected service, streaming objective / timeline / dashboard updates as it
 * works, then returns a combined payload for Jarvis to narrate.
 */
export const run = action({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const userId = await requireUser(ctx);
    const log = (kind: string, label: string, detail?: string) =>
      ctx.runMutation(api.timeline.log, { kind, label, detail });
    const setObjective = (text: string, state: "idle" | "working" = "working") =>
      ctx.runMutation(api.objective.set, { text, state });

    await log("briefing", "Daily briefing started", "Gathering intelligence from connected services");

    const connections = await ctx.runQuery(api.connections.list, {});
    const connected = new Set(
      connections.filter((c) => c.status === "connected").map((c) => c.toolkit)
    );

    if (connected.size === 0) {
      await setObjective("Standing by", "idle");
      return {
        error: "no_services",
        message:
          "No services are connected yet. Suggest connecting Gmail, Google Calendar, or Notion first.",
      };
    }

    const composio = getComposio();
    const summary: Record<string, unknown> = {};

    if (connected.has("gmail")) {
      await setObjective("Reading inbox");
      await log("executing", "Executing action", "Scanning unread email");
      try {
        const result = await composio.tools.execute("GMAIL_FETCH_EMAILS", {
          userId: String(userId),
          dangerouslySkipVersionCheck: true,
          arguments: { query: "is:unread", max_results: 10 },
        });
        if (result.successful) {
          const shaped = shapeEmails(result.data);
          summary.emails = shaped;
          await ctx.runMutation(api.dashboard.setCard, {
            key: "emails",
            data: {
              unread: shaped.count,
              important: shaped.emails.slice(0, 4),
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "gmail" });
          await log("results", "Inbox scanned", `${shaped.count} unread messages`);
        }
      } catch (err) {
        await log("error", "Email scan failed", err instanceof Error ? err.message : String(err));
      }
    }

    if (connected.has("googlecalendar")) {
      await setObjective("Summarizing meetings");
      await log("executing", "Executing action", "Reviewing today's calendar");
      try {
        const now = new Date();
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        const result = await composio.tools.execute("GOOGLECALENDAR_EVENTS_LIST", {
          userId: String(userId),
          dangerouslySkipVersionCheck: true,
          arguments: {
            calendar_id: "primary",
            time_min: now.toISOString(),
            time_max: endOfDay.toISOString(),
            single_events: true,
            order_by: "startTime",
            max_results: 15,
          },
        });
        if (result.successful) {
          const shaped = shapeEvents(result.data);
          summary.calendar = shaped;
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
          await log("results", "Calendar reviewed", `${shaped.count} events remaining today`);
        }
      } catch (err) {
        await log("error", "Calendar scan failed", err instanceof Error ? err.message : String(err));
      }
    }

    if (connected.has("notion")) {
      await setObjective("Searching notes");
      await log("executing", "Executing action", "Pulling recent Notion documents");
      try {
        const result = await composio.tools.execute("NOTION_SEARCH_NOTION_PAGE", {
          userId: String(userId),
          dangerouslySkipVersionCheck: true,
          arguments: { query: "", page_size: 6 },
        });
        if (result.successful) {
          const shaped = shapeNotes(result.data);
          summary.notes = shaped;
          await ctx.runMutation(api.dashboard.setCard, {
            key: "notes",
            data: {
              recent: shaped.notes.slice(0, 5),
              sources: ["Notion"],
              lastSync: Date.now(),
            },
          });
          await ctx.runMutation(api.connections.touchSync, { toolkit: "notion" });
          await log("results", "Notes indexed", `${shaped.count} recent documents`);
        }
      } catch (err) {
        await log("error", "Notes scan failed", err instanceof Error ? err.message : String(err));
      }
    }

    // Fold in native to-dos and memory context so the narration is personal.
    const todos = await ctx.runQuery(api.todos.list, {});
    summary.todos = {
      pendingCount: todos.pending.length,
      top: todos.pending.slice(0, 5).map((t) => ({
        title: t.title,
        priority: t.priority,
        due: t.dueAt ? new Date(t.dueAt).toISOString() : undefined,
      })),
    };
    const facts = await ctx.runQuery(api.memory.list, {});
    summary.userContext = facts.slice(0, 8).map((f) => `${f.key}: ${f.value}`);

    await setObjective("Generating daily briefing");
    await log("briefing", "Briefing compiled", "Delivering executive summary");
    await setObjective("Standing by", "idle");

    return {
      ok: true,
      briefing: summary,
      instruction:
        "Deliver a concise, confident spoken executive summary of the day: unread email highlights, today's meetings, relevant notes. Mention specifics. Keep it under 45 seconds of speech.",
    };
  },
});
