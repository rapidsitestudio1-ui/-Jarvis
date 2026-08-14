import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { requireUser } from "./auth";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!profile) return null;
    const avatarUrl = profile.avatarStorageId
      ? await ctx.storage.getUrl(profile.avatarStorageId)
      : null;
    return { ...profile, avatarUrl };
  },
});

export const update = mutation({
  args: {
    displayName: v.optional(v.string()),
    role: v.optional(v.string()),
    company: v.optional(v.string()),
    location: v.optional(v.string()),
    timezone: v.optional(v.string()),
    communicationStyle: v.optional(v.string()),
    signOff: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("profiles", { userId, ...args, updatedAt: now });
    }
    await ctx.db.insert("timelineEvents", {
      userId,
      kind: "memory_updated",
      label: "Profile updated",
      detail: args.displayName ? `Operator: ${args.displayName}` : undefined,
      createdAt: now,
    });
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    // Clean up the previous avatar file if there was one.
    if (existing?.avatarStorageId) {
      await ctx.storage.delete(existing.avatarStorageId).catch(() => {});
    }
    if (existing) {
      await ctx.db.patch(existing._id, { avatarStorageId: args.storageId, updatedAt: now });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        avatarStorageId: args.storageId,
        updatedAt: now,
      });
    }
  },
});
