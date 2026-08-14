import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireUser } from "./auth";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const result: Record<string, { data: unknown; updatedAt: number }> = {};
    if (!userId) return result;
    const rows = await ctx.db
      .query("dashboard")
      .withIndex("by_user_key", (q) => q.eq("userId", userId))
      .collect();
    for (const row of rows) {
      result[row.key] = { data: row.data, updatedAt: row.updatedAt };
    }
    return result;
  },
});

export const setCard = mutation({
  args: {
    key: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("dashboard")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", args.key))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { data: args.data, updatedAt: now });
    } else {
      await ctx.db.insert("dashboard", {
        userId,
        key: args.key,
        data: args.data,
        updatedAt: now,
      });
    }
  },
});
