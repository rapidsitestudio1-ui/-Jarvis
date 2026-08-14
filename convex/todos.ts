import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { requireUser } from "./auth";

const priorityValidator = v.union(v.literal("high"), v.literal("normal"), v.literal("low"));

const PRIORITY_ORDER: Record<string, number> = { high: 0, normal: 1, low: 2 };

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { pending: [], done: [] };
    const all = await ctx.db
      .query("todos")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    const pending = all
      .filter((t) => t.status === "pending")
      .sort((a, b) => {
        const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (p !== 0) return p;
        return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
      });
    const done = all
      .filter((t) => t.status === "done")
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, 8);
    return { pending, done };
  },
});

/** Fuzzy-match a todo by title substring or word overlap. */
function matchTodo(todos: Doc<"todos">[], title: string): Doc<"todos"> | undefined {
  const needle = title.trim().toLowerCase();
  if (!needle) return undefined;
  const exact = todos.find((t) => t.title.toLowerCase() === needle);
  if (exact) return exact;
  const partial = todos.filter(
    (t) => t.title.toLowerCase().includes(needle) || needle.includes(t.title.toLowerCase())
  );
  if (partial.length === 1) return partial[0];
  const words = needle.split(/\s+/).filter((w) => w.length > 2);
  let best: { todo: Doc<"todos">; score: number } | undefined;
  for (const t of todos) {
    const hay = t.title.toLowerCase();
    const score = words.filter((w) => hay.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { todo: t, score };
  }
  return partial[0] ?? best?.todo;
}

export const add = mutation({
  args: {
    title: v.string(),
    priority: v.optional(priorityValidator),
    dueAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const id = await ctx.db.insert("todos", {
      userId,
      title: args.title.trim(),
      priority: args.priority ?? "normal",
      status: "pending",
      dueAt: args.dueAt,
      notes: args.notes,
      createdAt: Date.now(),
    });
    return { id };
  },
});

export const complete = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const pending = await ctx.db
      .query("todos")
      .withIndex("by_user_status", (q) => q.eq("userId", userId).eq("status", "pending"))
      .collect();
    const match = matchTodo(pending, args.title);
    if (!match) return { ok: false as const, message: "No matching pending to-do found." };
    await ctx.db.patch(match._id, { status: "done", completedAt: Date.now() });
    return { ok: true as const, title: match.title };
  },
});

export const update = mutation({
  args: {
    title: v.string(),
    newTitle: v.optional(v.string()),
    priority: v.optional(priorityValidator),
    dueAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    reopen: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const all = await ctx.db
      .query("todos")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    const match = matchTodo(all, args.title);
    if (!match) return { ok: false as const, message: "No matching to-do found." };
    const patch: Partial<Doc<"todos">> = {};
    if (args.newTitle) patch.title = args.newTitle.trim();
    if (args.priority) patch.priority = args.priority;
    if (args.dueAt !== undefined) patch.dueAt = args.dueAt;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.reopen) {
      patch.status = "pending";
      patch.completedAt = undefined;
    }
    await ctx.db.patch(match._id, patch);
    return { ok: true as const, title: patch.title ?? match.title };
  },
});

export const remove = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const all = await ctx.db
      .query("todos")
      .withIndex("by_user_status", (q) => q.eq("userId", userId))
      .collect();
    const match = matchTodo(all, args.title);
    if (!match) return { ok: false as const, message: "No matching to-do found." };
    await ctx.db.delete(match._id);
    return { ok: true as const, title: match.title };
  },
});
