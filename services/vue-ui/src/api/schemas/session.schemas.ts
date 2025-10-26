/**
 * Session API Schemas
 * Zod schemas for validating session-related API responses
 */

import { z } from 'zod'

// Session Summary Schema
export const sessionSummarySchema = z.object({
  session_id: z.string(),
  device_id: z.string(),
  path: z.string().optional(),
  status: z.string(),
  start_ts: z.string(),
  end_ts: z.string().nullable(),
  postroll_sec: z.number().nullable().optional(),
  media_connect_ts: z.string().nullable().optional(),
  media_start_ts: z.string().nullable().optional(),
  media_end_ts: z.string().nullable().optional(),
  recommended_start_offset_ms: z.number().nullable().optional(),
  reason: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
})

// Session List Schemas
export const rangeSessionsSchema = z.object({
  from: z.string(),
  to: z.string(),
  sessions: z.array(sessionSummarySchema),
})

export const listSessionsSchema = z.object({
  sessions: z.array(sessionSummarySchema),
})

// Type exports
export type SessionSummary = z.infer<typeof sessionSummarySchema>
export type RangeSessions = z.infer<typeof rangeSessionsSchema>
export type ListSessions = z.infer<typeof listSessionsSchema>
