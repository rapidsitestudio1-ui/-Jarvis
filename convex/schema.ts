import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,

  // Operator profile — details Jarvis should know about each user.
  profiles: defineTable({
    userId: v.id("users"),
    displayName: v.optional(v.string()),
    role: v.optional(v.string()),
    company: v.optional(v.string()),
    location: v.optional(v.string()),
    timezone: v.optional(v.string()),
    communicationStyle: v.optional(v.string()), // concise | balanced | detailed
    signOff: v.optional(v.string()),
    notes: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Live conversation transcript. Streaming messages are patched in place.
  messages: defineTable({
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    status: v.union(v.literal("streaming"), v.literal("final"), v.literal("interrupted")),
    // Realtime API item id, used to patch streaming deltas into the right row
    itemId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_user_item", ["userId", "itemId"]),

  // What Jarvis knows about each user.
  memoryFacts: defineTable({
    userId: v.id("users"),
    category: v.union(
      v.literal("preference"),
      v.literal("project"),
      v.literal("fact"),
      v.literal("context"),
      v.literal("service")
    ),
    key: v.string(),
    value: v.string(),
    source: v.string(),
    updatedAt: v.number(),
  }).index("by_user_key", ["userId", "key"]),

  // Real-time activity stream shown in the right panel.
  timelineEvents: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    label: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  // External service connections (Composio-backed), per user.
  connections: defineTable({
    userId: v.id("users"),
    toolkit: v.string(), // gmail | googlecalendar | notion
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
  }).index("by_user_toolkit", ["userId", "toolkit"]),

  // Dashboard cards, one row per user per card key.
  dashboard: defineTable({
    userId: v.id("users"),
    key: v.string(), // emails | calendar | notes
    data: v.any(),
    updatedAt: v.number(),
  }).index("by_user_key", ["userId", "key"]),

  // Native to-do items, fully voice-managed.
  todos: defineTable({
    userId: v.id("users"),
    title: v.string(),
    priority: v.union(v.literal("high"), v.literal("normal"), v.literal("low")),
    status: v.union(v.literal("pending"), v.literal("done")),
    dueAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_user_status", ["userId", "status"]),

  // Per-user: what Jarvis is doing right now.
  objective: defineTable({
    userId: v.id("users"),
    text: v.string(),
    state: v.union(v.literal("idle"), v.literal("working"), v.literal("waiting_auth")),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // Per-user: orb state mirrored across that user's tabs.
  voiceState: defineTable({
    userId: v.id("users"),
    orbState: v.string(),
    sessionActive: v.boolean(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
