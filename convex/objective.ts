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
      .query("objective")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const set = mutation({
  args: {
    text: v.string(),
    state: v.union(v.literal("idle"), v.literal("working"), v.literal("waiting_auth")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("objective")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { text: args.text, state: args.state, updatedAt: now });
    } else {
      await ctx.db.insert("objective", {
        userId,
        text: args.text,
        state: args.state,
        updatedAt: now,
      });
    }
  },
});
