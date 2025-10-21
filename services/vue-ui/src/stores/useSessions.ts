import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { listSessions, type SessionSummary } from '../api/sessions'

/**
 * Store responsable de la lista de sesiones.
 * - Mantiene el array de sesiones y el id seleccionado.
 * - Provee `loadSessions` para cargar desde el backend y `selectSession`.
 */
export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<SessionSummary[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const selectedId = ref<string | null>(null)

  // Computed que devuelve la sesión seleccionada o null si no hay coincidencia
  const selectedSession = computed(
    () => sessions.value.find((session) => session.session_id === selectedId.value) ?? null,
  )

  /**
   * Carga sesiones desde el session store.
   * Acepta `params` para modo range/all y límites.
   */
  const loadSessions = async (
    params: { mode?: 'range' | 'all'; limit?: number; from?: string; to?: string } = {},
  ) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await listSessions(params)
      sessions.value = response.sessions
    } catch (err) {
      // Guardar mensaje legible para la UI
      console.error('Failed to load sessions', err)
      error.value = err instanceof Error ? err.message : 'Unexpected error'
    } finally {
      isLoading.value = false
    }
  }

  /** Selecciona una sesión por id (o la deselecciona con null). */
  const selectSession = (sessionId: string | null) => {
    selectedId.value = sessionId
  }

  return {
    sessions,
    isLoading,
    error,
    selectedId,
    selectedSession,
    loadSessions,
    selectSession,
  }
})
