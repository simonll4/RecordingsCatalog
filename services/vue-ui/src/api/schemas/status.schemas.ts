import { z } from 'zod'

export const edgeAgentRuntimeStatusSchema = z.object({
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

export type EdgeAgentRuntimeStatus = z.infer<typeof edgeAgentRuntimeStatusSchema>

export const edgeAgentManagerSnapshotSchema = z.object({
  state: z.enum(['idle', 'starting', 'running', 'stopping', 'error']),
  lastStartTs: z.string().nullable(),
  lastStopTs: z.string().nullable(),
  lastExit: z
    .object({
      code: z.number().nullable(),
      signal: z.string().nullable(),
      at: z.string(),
      reason: z.string().optional(),
    })
    .nullable(),
  childPid: z.number().nullable(),
  childUptimeMs: z.number().nullable(),
  statusPort: z.number(),
  overrides: z.object({
    classesFilter: z.array(z.string()),
  }),
})

export type EdgeAgentManagerSnapshot = z.infer<typeof edgeAgentManagerSnapshotSchema>

export const edgeAgentStatusEnvelopeSchema = z.object({
  manager: edgeAgentManagerSnapshotSchema,
  agent: edgeAgentRuntimeStatusSchema.nullable(),
})

export type EdgeAgentStatusEnvelope = z.infer<typeof edgeAgentStatusEnvelopeSchema>

export const edgeAgentManagerResponseSchema = z.object({
  manager: edgeAgentManagerSnapshotSchema,
})

export type EdgeAgentManagerResponse = z.infer<typeof edgeAgentManagerResponseSchema>

export const edgeAgentClassesConfigSchema = z.object({
  overrides: z.object({ classesFilter: z.array(z.string()) }),
  effective: z.array(z.string()),
  defaults: z.array(z.string()),
})

export type EdgeAgentClassesConfig = z.infer<typeof edgeAgentClassesConfigSchema>

export const edgeAgentClassesCatalogSchema = z.object({
  classes: z.array(z.string()),
})

export type EdgeAgentClassesCatalog = z.infer<typeof edgeAgentClassesCatalogSchema>
