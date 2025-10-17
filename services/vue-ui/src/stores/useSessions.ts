import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { listSessions, type SessionSummary } from '../api/sessions';

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<SessionSummary[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const selectedId = ref<string | null>(null);

  const selectedSession = computed(() =>
    sessions.value.find((session) => session.session_id === selectedId.value) ?? null
  );

  const loadSessions = async (params: { mode?: 'range' | 'all'; limit?: number; from?: string; to?: string } = {}) => {
    isLoading.value = true;
    error.value = null;
    try {
      const response = await listSessions(params);
      sessions.value = response.sessions;
    } catch (err) {
      console.error('Failed to load sessions', err);
      error.value = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      isLoading.value = false;
    }
  };

  const selectSession = (sessionId: string | null) => {
    selectedId.value = sessionId;
  };

  return {
    sessions,
    isLoading,
    error,
    selectedId,
    selectedSession,
    loadSessions,
    selectSession
  };
});
