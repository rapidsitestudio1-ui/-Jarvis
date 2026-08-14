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
      .query("timelineEvents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(80);
  },
});

export const log = mutation({
  args: {
    kind: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    await ctx.db.insert("timelineEvents", {
      userId,
      kind: args.kind,
      label: args.label,
      detail: args.detail,
      createdAt: Date.now(),
    });
  },
});
