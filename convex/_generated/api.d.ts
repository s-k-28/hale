/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as buddies from "../buddies.js";
import type * as checkins from "../checkins.js";
import type * as community from "../community.js";
import type * as communityModeration from "../communityModeration.js";
import type * as communityPosts from "../communityPosts.js";
import type * as cravings from "../cravings.js";
import type * as crons from "../crons.js";
import type * as email from "../email.js";
import type * as feed from "../feed.js";
import type * as goals from "../goals.js";
import type * as http from "../http.js";
import type * as leagues from "../leagues.js";
import type * as model_anonHandles from "../model/anonHandles.js";
import type * as model_buddy from "../model/buddy.js";
import type * as model_cohort from "../model/cohort.js";
import type * as model_communityRules from "../model/communityRules.js";
import type * as model_entitlement from "../model/entitlement.js";
import type * as model_plan from "../model/plan.js";
import type * as model_rcWebhook from "../model/rcWebhook.js";
import type * as model_sage from "../model/sage.js";
import type * as model_streak from "../model/streak.js";
import type * as model_trial from "../model/trial.js";
import type * as nudges from "../nudges.js";
import type * as pushes from "../pushes.js";
import type * as rag from "../rag.js";
import type * as referrals from "../referrals.js";
import type * as relapse from "../relapse.js";
import type * as sage from "../sage.js";
import type * as sageKnowledge from "../sageKnowledge.js";
import type * as squads from "../squads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  analytics: typeof analytics;
  auth: typeof auth;
  buddies: typeof buddies;
  checkins: typeof checkins;
  community: typeof community;
  communityModeration: typeof communityModeration;
  communityPosts: typeof communityPosts;
  cravings: typeof cravings;
  crons: typeof crons;
  email: typeof email;
  feed: typeof feed;
  goals: typeof goals;
  http: typeof http;
  leagues: typeof leagues;
  "model/anonHandles": typeof model_anonHandles;
  "model/buddy": typeof model_buddy;
  "model/cohort": typeof model_cohort;
  "model/communityRules": typeof model_communityRules;
  "model/entitlement": typeof model_entitlement;
  "model/plan": typeof model_plan;
  "model/rcWebhook": typeof model_rcWebhook;
  "model/sage": typeof model_sage;
  "model/streak": typeof model_streak;
  "model/trial": typeof model_trial;
  nudges: typeof nudges;
  pushes: typeof pushes;
  rag: typeof rag;
  referrals: typeof referrals;
  relapse: typeof relapse;
  sage: typeof sage;
  sageKnowledge: typeof sageKnowledge;
  squads: typeof squads;
  users: typeof users;
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

export declare const components: {
  rag: import("@convex-dev/rag/_generated/component.js").ComponentApi<"rag">;
};
