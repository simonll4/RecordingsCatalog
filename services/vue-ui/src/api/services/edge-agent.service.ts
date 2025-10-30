import { edgeAgentClient } from '../http'
import { edgeAgentStatusSchema, type EdgeAgentStatus } from '../schemas/status.schemas'

/**
 * Edge Agent Service
 * Provides status/health information for the live streaming agent.
 */
export const edgeAgentService = {
  /**
   * Fetch current status snapshot.
   */
  async getStatus(): Promise<EdgeAgentStatus> {
    return edgeAgentClient.getJson('/status', edgeAgentStatusSchema)
  },
}
