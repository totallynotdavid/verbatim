/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as annotations from "../annotations.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as interviewQuestions from "../interviewQuestions.js";
import type * as interviewSegments from "../interviewSegments.js";
import type * as lessonSessions from "../lessonSessions.js";
import type * as model_annotations from "../model/annotations.js";
import type * as model_reviewCards from "../model/reviewCards.js";
import type * as model_scheduling from "../model/scheduling.js";
import type * as model_scoring from "../model/scoring.js";
import type * as model_sessions from "../model/sessions.js";
import type * as retryRecordings from "../retryRecordings.js";
import type * as retryScoring from "../retryScoring.js";
import type * as reviewCards from "../reviewCards.js";
import type * as scoring from "../scoring.js";
import type * as transcriptLines from "../transcriptLines.js";
import type * as trends from "../trends.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  annotations: typeof annotations;
  auth: typeof auth;
  http: typeof http;
  interviewQuestions: typeof interviewQuestions;
  interviewSegments: typeof interviewSegments;
  lessonSessions: typeof lessonSessions;
  "model/annotations": typeof model_annotations;
  "model/reviewCards": typeof model_reviewCards;
  "model/scheduling": typeof model_scheduling;
  "model/scoring": typeof model_scoring;
  "model/sessions": typeof model_sessions;
  retryRecordings: typeof retryRecordings;
  retryScoring: typeof retryScoring;
  reviewCards: typeof reviewCards;
  scoring: typeof scoring;
  transcriptLines: typeof transcriptLines;
  trends: typeof trends;
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

export declare const components: {};
