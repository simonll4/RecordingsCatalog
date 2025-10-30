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

// Track metadata (meta.json) produced by worker-ai SessionWriter
export const trackMetaSchema = z.object({
  session_id: z.string(),
  device_id: z.string(),
  start_time: z.string(),
  end_time: z.string().nullable(),
  frame_count: z.number(),
  fps: z.number(),
  path: z.string().nullish(),
  video: z
    .object({
      width: z.number().nullable().default(null),
      height: z.number().nullable().default(null),
      fps: z.number().nullable().default(null),
    })
    .default({ width: null, height: null, fps: null }),
  classes: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
      })
    )
    .default([]),
})

// Track index schema for index.json
export const trackIndexSchema = z.object({
  segment_duration_s: z.number(),
  segments: z.array(
    z.object({
      i: z.number(),
      t0: z.number(),
      t1: z.number(),
      url: z.string(),
      count: z.number(),
      closed: z.boolean().optional(),
    })
  ),
  fps: z.number(),
  duration_s: z.number(),
})

// Type exports
export type SessionSummary = z.infer<typeof sessionSummarySchema>
export type RangeSessions = z.infer<typeof rangeSessionsSchema>
export type ListSessions = z.infer<typeof listSessionsSchema>
export type TrackMeta = z.infer<typeof trackMetaSchema>
export type TrackIndex = z.infer<typeof trackIndexSchema>
