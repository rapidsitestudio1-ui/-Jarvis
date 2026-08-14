import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireUser } from "./auth";

const categoryValidator = v.union(
  v.literal("preference"),
  v.literal("project"),
  v.literal("fact"),
  v.literal("context"),
  v.literal("service")
);

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const facts = await ctx.db
      .query("memoryFacts")
      .withIndex("by_user_key", (q) => q.eq("userId", userId))
      .collect();
    return facts.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

/** Insert or update a fact. Matching is done on a normalized key. */
export const remember = mutation({
  args: {
    category: categoryValidator,
    key: v.string(),
    value: v.string(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const key = args.key.trim().toLowerCase();
    const existing = await ctx.db
      .query("memoryFacts")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        category: args.category,
        source: args.source,
        updatedAt: now,
      });
      return { updated: true, key };
    }
    await ctx.db.insert("memoryFacts", {
      userId,
      category: args.category,
      key,
      value: args.value,
      source: args.source,
      updatedAt: now,
    });
    return { updated: false, key };
  },
});

export const forget = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const key = args.key.trim().toLowerCase();
    const existing = await ctx.db
      .query("memoryFacts")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { forgotten: true };
    }
    // Fall back to fuzzy match on key substring.
    const all = await ctx.db
      .query("memoryFacts")
      .withIndex("by_user_key", (q) => q.eq("userId", userId))
      .collect();
    const match = all.find((f) => f.key.includes(key) || key.includes(f.key));
    if (match) {
      await ctx.db.delete(match._id);
      return { forgotten: true };
    }
    return { forgotten: false };
  },
});
