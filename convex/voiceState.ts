import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireUser } from "./auth";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("voiceState")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const set = mutation({
  args: {
    orbState: v.string(),
    sessionActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("voiceState")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        orbState: args.orbState,
        sessionActive: args.sessionActive,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("voiceState", {
        userId,
        orbState: args.orbState,
        sessionActive: args.sessionActive,
        updatedAt: now,
      });
    }
  },
});
