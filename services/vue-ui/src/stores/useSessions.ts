import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { sessionService, type SessionSummary, type ListSessionsParams } from '@/api'
import { getErrorMessage, logError } from '@/utils'

/**
 * Sessions Store
 * Manages the list of sessions and selected session
 * - Maintains sessions array and selected session ID
 * - Provides methods to load sessions from backend
 * - Handles loading and error states
 */
export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<SessionSummary[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const selectedId = ref<string | null>(null)
  const lastParams = ref<ListSessionsParams | undefined>(undefined)

  // Computed que devuelve la sesión seleccionada o null si no hay coincidencia
  const selectedSession = computed(
    () => sessions.value.find((session) => session.session_id === selectedId.value) ?? null,
  )

  /**
   * Load sessions from the session store
   * Accepts params for range/all mode and limits
   */
  const loadSessions = async (params: ListSessionsParams = {}) => {
    const hasCustomParams = Object.keys(params).length > 0
    const effectiveParams: ListSessionsParams =
      hasCustomParams
        ? { ...params }
        : lastParams.value
        ? { ...lastParams.value }
        : { mode: 'all' }

    lastParams.value = { ...effectiveParams }

    isLoading.value = true
    error.value = null
    try {
      const response = await sessionService.listSessions(effectiveParams)
      sessions.value = response.sessions
    } catch (err) {
      logError('useSessionsStore.loadSessions', err)
      error.value = getErrorMessage(err)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Select a session by ID (or deselect with null)
   */
  const selectSession = (sessionId: string | null) => {
    selectedId.value = sessionId
  }

  /**
   * Refresh sessions (reload with current params)
   */
  const refreshSessions = async () => {
    await loadSessions({})
  }

  /**
   * Clear all sessions
   */
  const clearSessions = () => {
    sessions.value = []
    selectedId.value = null
    error.value = null
    lastParams.value = undefined
  }

  return {
    // State
    sessions,
    isLoading,
    error,
    selectedId,
    
    // Computed
    selectedSession,
    
    // Actions
    loadSessions,
    selectSession,
    refreshSessions,
    clearSessions,
  }
})
