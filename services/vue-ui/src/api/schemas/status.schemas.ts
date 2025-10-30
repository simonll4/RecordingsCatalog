import { z } from 'zod'

export const edgeAgentStatusSchema = z.object({
  online: z.literal(true),
  timestamp: z.string(),
  startedAt: z.string(),
  uptimeMs: z.number(),
  heartbeatTs: z.string().nullable(),
  detections: z.object({
    total: z.number(),
    lastDetectionTs: z.string().nullable(),
  }),
  session: z.object({
    active: z.boolean(),
    currentSessionId: z.string().nullable(),
    lastSessionId: z.string().nullable(),
    lastChangeTs: z.string().nullable(),
  }),
  streams: z.object({
    live: z.object({
      running: z.boolean(),
      startedAt: z.string().nullable(),
    }),
    record: z.object({
      running: z.boolean(),
      startedAt: z.string().nullable(),
      lastStoppedAt: z.string().nullable(),
    }),
  }),
})

export type EdgeAgentStatus = z.infer<typeof edgeAgentStatusSchema>
