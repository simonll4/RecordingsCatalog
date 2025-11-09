<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import SessionList from '../components/SessionList.vue'
import SessionSearch from '../components/SessionSearch.vue'
import { useSessionsStore } from '../stores/useSessions'

/**
 * Vista principal (home): muestra el buscador de sesiones y la lista.
 * - Carga por defecto sesiones del último `defaultRangeHours`.
 * - Maneja `search` (desde `SessionSearch`) y `select` (desde `SessionList`).
 */
const sessionsStore = useSessionsStore()
const router = useRouter()

const defaultRangeHours = 1

const loadDefaultSessions = async () => {
  const to = new Date()
  const from = new Date(to.getTime() - defaultRangeHours * 60 * 60 * 1000)
  await sessionsStore.loadSessions({
    mode: 'range',
    from: from.toISOString(),
    to: to.toISOString(),
  })
}

// Handler del evento `search` emitido por SessionSearch
const handleSearch = async (range: { from: string; to: string; classes?: string[]; color?: string }) => {
  await sessionsStore.loadSessions({
    mode: 'range',
    from: range.from,
    to: range.to,
    classes: range.classes,
    color: range.color,
  })
}

// Handler para cargar todas las sesiones sin filtros
const handleSearchAll = async () => {
  await sessionsStore.loadSessions({
    mode: 'all',
  })
}

// Handler cuando el usuario selecciona una sesión: guarda y navega
const handleSelect = (sessionId: string) => {
  if (!sessionId) return
  sessionsStore.selectSession(sessionId)
  router.push({ name: 'session', params: { sessionId } })
}

onMounted(() => {
  void loadDefaultSessions()
})
</script>

<template>
  <section class="home">
    <header class="home__header">
      <div>
        <h1>Sesiones con detecciones relevantes</h1>
        <p class="subtitle">
          Elegí una sesión para reproducir el clip y superponer las anotaciones.
        </p>
      </div>
    </header>

    <SessionSearch
      @search="handleSearch"
      @search-all="handleSearchAll"
    />

    <SessionList
      :sessions="sessionsStore.sessions"
      :selected-id="sessionsStore.selectedId"
      :loading="sessionsStore.isLoading"
      :error="sessionsStore.error"
      @select="handleSelect"
    />
  </section>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.home__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.subtitle {
  margin-top: 0.5rem;
  color: rgba(255, 255, 255, 0.65);
}
</style>
