import { edgeAgentClient } from '../http'
import { HttpError } from '../http/client'
import {
  edgeAgentStatusEnvelopeSchema,
  edgeAgentManagerResponseSchema,
  edgeAgentClassesConfigSchema,
  edgeAgentClassesCatalogSchema,
  edgeAgentRuntimeStatusSchema,
  type EdgeAgentStatusEnvelope,
  type EdgeAgentManagerSnapshot,
  type EdgeAgentClassesConfig,
  type EdgeAgentClassesCatalog,
} from '../schemas/status.schemas'
import { z } from 'zod'

/**
 * Edge Agent Service
 * Provides status/health information for the live streaming agent.
 */
export const edgeAgentService = {
  /**
   * Fetch current status snapshot.
   */
  async getStatus(): Promise<EdgeAgentStatusEnvelope> {
    let response: Response
    try {
      response = await edgeAgentClient.getRaw('/status')
    } catch (err) {
      throw err
    }

    const text = await response.text()

    let payload: unknown = null
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch (err) {
        throw new Error(`Respuesta de estado inválida: ${(err as Error).message}`)
      }
    }

    const envelopeResult = edgeAgentStatusEnvelopeSchema.safeParse(payload)
    if (envelopeResult.success) {
      return envelopeResult.data
    }

    const legacyResult = edgeAgentRuntimeStatusSchema.safeParse(payload)
    if (legacyResult.success) {
      const runtime = legacyResult.data
      return {
        manager: {
          state: 'running',
          lastStartTs: runtime.startedAt,
          lastStopTs: null,
          lastExit: null,
          childPid: null,
          childUptimeMs: runtime.uptimeMs,
          statusPort: 0,
          overrides: { classesFilter: [] },
        },
        agent: runtime,
      }
    }

    throw new Error('Payload de estado no reconocido')
  },

  /**
   * Request agent start.
   */
  async start(): Promise<EdgeAgentManagerSnapshot> {
    try {
      const response = await edgeAgentClient.postJson(
        '/control/start',
        {},
        edgeAgentManagerResponseSchema,
        { expectedStatuses: [200, 202] }
      )
      return response.manager
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        throw new Error('El supervisor no está disponible en este endpoint.')
      }
      throw err
    }
  },

  /**
   * Request agent stop.
   */
  async stop(): Promise<EdgeAgentManagerSnapshot> {
    try {
      const response = await edgeAgentClient.postJson(
        '/control/stop',
        {},
        edgeAgentManagerResponseSchema,
        { expectedStatuses: [200, 202] }
      )
      return response.manager
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        throw new Error('El supervisor no está disponible en este endpoint.')
      }
      throw err
    }
  },

  /**
   * Retrieve configured classes.
   */
  async getClasses(): Promise<EdgeAgentClassesConfig> {
    try {
      return await edgeAgentClient.getJson('/config/classes', edgeAgentClassesConfigSchema)
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        throw new Error('El supervisor no expone la gestión de clases (ejecutá el manager).')
      }
      throw err
    }
  },

  /**
   * Update classes override.
   */
  async updateClasses(classes: string[]): Promise<EdgeAgentClassesConfig> {
    try {
      return await edgeAgentClient.putJson(
        '/config/classes',
        { classes },
        edgeAgentClassesConfigSchema
      )
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        throw new Error('El supervisor no expone la gestión de clases (ejecutá el manager).')
      }
      throw err
    }
  },

  /**
   * Retrieve class catalog.
   */
  async getCatalog(): Promise<EdgeAgentClassesCatalog> {
    try {
      return await edgeAgentClient.getJson(
        '/config/classes/catalog',
        edgeAgentClassesCatalogSchema
      )
    } catch (err) {
      if (err instanceof HttpError && err.status === 404) {
        throw new Error('Catálogo de clases no disponible sin el supervisor.')
      }
      throw err
    }
  },
}
