/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as briefing from "../briefing.js";
import type * as composio from "../composio.js";
import type * as connections from "../connections.js";
import type * as dashboard from "../dashboard.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as memory from "../memory.js";
import type * as messages from "../messages.js";
import type * as objective from "../objective.js";
import type * as profiles from "../profiles.js";
import type * as reset from "../reset.js";
import type * as timeline from "../timeline.js";
import type * as todos from "../todos.js";
import type * as tools from "../tools.js";
import type * as voiceState from "../voiceState.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  briefing: typeof briefing;
  composio: typeof composio;
  connections: typeof connections;
  dashboard: typeof dashboard;
  http: typeof http;
  init: typeof init;
  memory: typeof memory;
  messages: typeof messages;
  objective: typeof objective;
  profiles: typeof profiles;
  reset: typeof reset;
  timeline: typeof timeline;
  todos: typeof todos;
  tools: typeof tools;
  voiceState: typeof voiceState;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
