<script setup lang="ts">
import { computed } from 'vue';
import type { SessionSummary } from '../api/sessions';

const props = defineProps<{
  sessions: SessionSummary[];
  selectedId: string | null;
  loading?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', sessionId: string): void;
}>();

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'medium'
});

const formattedSessions = computed(() =>
  props.sessions.map((session) => ({
    ...session,
    startLabel: formatter.format(new Date(session.start_ts)),
    endLabel: session.end_ts ? formatter.format(new Date(session.end_ts)) : 'En curso'
  }))
);
</script>

<template>
  <div class="session-list">
    <p v-if="error" class="error">⚠️ {{ error }}</p>
    <p v-else-if="loading" class="loading">Cargando sesiones…</p>
    <template v-else-if="formattedSessions.length === 0">
      <p class="empty">No se encontraron sesiones en el rango seleccionado.</p>
    </template>
    <div v-else class="grid">
      <article
        v-for="session in formattedSessions"
        :key="session.session_id"
        class="card"
        :class="{ active: selectedId === session.session_id }"
        @click="emit('select', session.session_id)"
      >
        <header class="card__header">
          <h2>{{ session.session_id }}</h2>
          <span class="chip" :class="session.end_ts ? 'chip--closed' : 'chip--live'">
            {{ session.end_ts ? 'cerrada' : 'en vivo' }}
          </span>
        </header>
        <dl>
          <div>
            <dt>Dispositivo</dt>
            <dd>{{ session.device_id }}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{{ session.startLabel }}</dd>
          </div>
          <div>
            <dt>Fin</dt>
            <dd>{{ session.endLabel }}</dd>
          </div>
        </dl>
      </article>
    </div>
  </div>
</template>

<style scoped>
.session-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.loading,
.empty {
  color: rgba(255, 255, 255, 0.6);
}

.error {
  color: #ff6b6b;
}

.grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  cursor: pointer;
  border: 1px solid transparent;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.card:hover {
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.card.active {
  border-color: #4dabf7;
  background: rgba(77, 171, 247, 0.12);
}

.card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.card__header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.chip {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.chip--live {
  background: rgba(250, 82, 82, 0.2);
  color: #ff8787;
}

.chip--closed {
  background: rgba(116, 184, 22, 0.2);
  color: #a9e34b;
}

dl {
  margin: 0;
  display: grid;
  gap: 0.5rem;
}

dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.5);
}

dd {
  margin: 0;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.9);
}
</style>
