import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireUser } from "./auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(60);
    return messages.reverse();
  },
});

/** Create or patch a streaming message identified by the Realtime item id. */
export const upsertStreaming = mutation({
  args: {
    itemId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("itemId", args.itemId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { text: args.text });
    } else {
      await ctx.db.insert("messages", {
        userId,
        role: args.role,
        text: args.text,
        status: "streaming",
        itemId: args.itemId,
        createdAt: Date.now(),
      });
    }
  },
});

export const finalize = mutation({
  args: {
    itemId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    interrupted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const status = args.interrupted ? ("interrupted" as const) : ("final" as const);
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_user_item", (q) => q.eq("userId", userId).eq("itemId", args.itemId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { text: args.text, status });
    } else {
      await ctx.db.insert("messages", {
        userId,
        role: args.role,
        text: args.text,
        status,
        itemId: args.itemId,
        createdAt: Date.now(),
      });
    }
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const all = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    await Promise.all(all.map((m) => ctx.db.delete(m._id)));
  },
});
