import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireUser } from "./auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("connections")
      .withIndex("by_user_toolkit", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    toolkit: v.string(),
    name: v.string(),
    status: v.union(
      v.literal("available"),
      v.literal("pending_auth"),
      v.literal("connected"),
      v.literal("error")
    ),
    connectedAccountId: v.optional(v.string()),
    authUrl: v.optional(v.string()),
    accountLabel: v.optional(v.string()),
    lastSync: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_user_toolkit", (q) => q.eq("userId", userId).eq("toolkit", args.toolkit))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        status: args.status,
        connectedAccountId: args.connectedAccountId,
        authUrl: args.authUrl,
        accountLabel: args.accountLabel ?? existing.accountLabel,
        lastSync: args.lastSync ?? existing.lastSync,
        error: args.error,
      });
    } else {
      await ctx.db.insert("connections", { userId, ...args });
    }
  },
});

export const touchSync = mutation({
  args: { toolkit: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_user_toolkit", (q) => q.eq("userId", userId).eq("toolkit", args.toolkit))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSync: Date.now() });
    }
  },
});
