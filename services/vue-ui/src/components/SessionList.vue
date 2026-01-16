<script setup lang="ts">
import { computed } from 'vue'
import type { SessionSummary } from '@/api'

/**
 * Lista de sesiones en forma de tarjetas.
 * Props:
 * - `sessions`: arreglo de `SessionSummary` (desde la API)
 * - `selectedId`: id de la sesión actualmente seleccionada
 * Emite `select` con `sessionId` cuando el usuario hace click en una tarjeta.
 */
const props = defineProps<{
  sessions: SessionSummary[]
  selectedId: string | null
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  (e: 'select', sessionId: string): void
}>()

// Formateador local de fechas para mostrar inicio/fin
const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'medium',
})

// Computed que agrega etiquetas legibles a cada sesión
const formattedSessions = computed(() =>
  props.sessions.map((session) => ({
    ...session,
    startLabel: formatter.format(new Date(session.start_ts)),
    endLabel: session.end_ts ? formatter.format(new Date(session.end_ts)) : 'En curso',
  })),
)
</script>

<template>
  <div class="session-list">
    <p v-if="error" class="error">{{ error }}</p>
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
        
        <div
          v-if="(session.configured_classes && session.configured_classes.length > 0) || (session.detected_classes && session.detected_classes.length > 0)"
          class="classes-card"
        >
          <div
            v-if="session.configured_classes && session.configured_classes.length > 0"
            class="classes-block"
          >
            <span class="classes-label">Configuradas:</span>
            <div class="class-tags">
              <span
                v-for="className in session.configured_classes"
                :key="`cfg-${session.session_id}-${className}`"
                class="class-tag"
                :class="session.detected_classes?.includes(className) ? 'class-tag--hit' : 'class-tag--pending'"
              >
                <span class="tag-name">{{ className }}</span>
              </span>
            </div>
          </div>

          <div
            v-if="session.detected_classes && session.detected_classes.length > 0"
            class="classes-block"
          >
            <span class="classes-label">Detectadas:</span>
            <div class="class-tags">
              <span
                v-for="className in session.detected_classes"
                :key="`det-${session.session_id}-${className}`"
                class="class-tag"
                :class="session.configured_classes?.includes(className) ? 'class-tag--hit' : 'class-tag--extra'"
              >
                <span class="tag-name">{{ className }}</span>
              </span>
            </div>
          </div>
        </div>
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
  transition:
    border-color 0.2s ease,
    transform 0.2s ease;
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

.classes-card {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.classes-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.classes-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.5);
}

.class-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.class-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(77, 171, 247, 0.15);
  border: 1px solid rgba(77, 171, 247, 0.3);
  border-radius: 0.4rem;
  padding: 0.3rem 0.6rem;
  font-size: 0.75rem;
  color: #4dabf7;
}

.class-tag--hit {
  background: rgba(76, 201, 240, 0.2);
  border-color: rgba(76, 201, 240, 0.45);
  color: #40c057;
}

.class-tag--pending {
  background: rgba(255, 214, 102, 0.15);
  border-color: rgba(255, 214, 102, 0.35);
  color: #ffd43b;
}

.class-tag--extra {
  background: rgba(237, 100, 166, 0.18);
  border-color: rgba(237, 100, 166, 0.4);
  color: #ff6bcb;
}

.tag-name {
  text-transform: capitalize;
}
</style>
