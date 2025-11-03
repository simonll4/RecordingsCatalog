<template>
  <section class="control-view">
    <header class="control-header">
      <div>
        <h1>Control del Edge Agent</h1>
  <p class="subtitle">Monitoreá el stream en vivo, gestioná el ciclo de vida del servicio y ajustá las clases a detectar.</p>
      </div>
      <div class="control-header__actions">
        <button class="btn btn-secondary" @click="refreshStatus" :disabled="isStatusLoading">
          {{ isStatusLoading ? 'Actualizando…' : 'Refrescar estado' }}
        </button>
      </div>
    </header>

    <section class="control-grid">
      <div class="live-panel">
        <WebRtcPlayer />
      </div>

      <article class="card">
        <header class="card-header">
          <div>
            <h2>Servicio</h2>
            <p class="muted">Estado del supervisor y proceso hijo.</p>
          </div>
          <span class="status" :class="serviceStatusClass">{{ serviceStateLabel }}</span>
        </header>

        <dl class="card-metrics">
          <div>
            <dt>Estado</dt>
            <dd>{{ serviceStateLabel }}</dd>
          </div>
          <div>
            <dt>PID</dt>
            <dd>{{ managerStatus?.childPid ?? '—' }}</dd>
          </div>
          <div>
            <dt>Uptime</dt>
            <dd>{{ uptimeText }}</dd>
          </div>
          <div>
            <dt>Último inicio</dt>
            <dd>{{ lastStartText }}</dd>
          </div>
          <div>
            <dt>Último stop</dt>
            <dd>{{ lastStopText }}</dd>
          </div>
          <div>
            <dt>Puerto de estado</dt>
            <dd>{{ managerStatus?.statusPort ?? '—' }}</dd>
          </div>
          <div>
            <dt>Última salida</dt>
            <dd>{{ lastExitText }}</dd>
          </div>
        </dl>

        <div class="card-actions">
          <button class="btn btn-primary" @click="startAgent" :disabled="startDisabled">
            {{ isMutating && serviceState === 'starting' ? 'Iniciando…' : 'Iniciar servicio' }}
          </button>
          <button class="btn btn-secondary" @click="stopAgent" :disabled="stopDisabled">
            {{ isMutating && serviceState === 'stopping' ? 'Deteniendo…' : 'Detener servicio' }}
          </button>
        </div>

        <p v-if="statusError" class="help-text help-text--error">{{ statusError }}</p>
        <p v-else-if="!managerAvailable" class="help-text help-text--error">
          Supervisor no disponible. Ejecutá <code>npm run dev:manager</code> o actualizá el contenedor.
        </p>
        <p v-else class="help-text">
          Las acciones actúan sobre el proceso edge-agent. Verificá la conexión del stream WebRTC arriba para confirmar que el servicio está procesando frames.
        </p>
      </article>

      <article class="card">
        <header class="card-header">
          <div>
            <h2>Monitoreo</h2>
            <p class="muted">Resumen del estado publicado por el agente.</p>
          </div>
        </header>

        <div v-if="runtimeStatus" class="runtime-grid">
          <div>
            <span>Heartbeat</span>
            <strong>{{ formatRelativeTime(runtimeStatus.heartbeatTs) }}</strong>
          </div>
          <div>
            <span>Última detección</span>
            <strong>{{ formatRelativeTime(runtimeStatus.detections.lastDetectionTs) }}</strong>
          </div>
          <div>
            <span>Detecciones totales</span>
            <strong>{{ runtimeStatus.detections.total }}</strong>
          </div>
          <div>
            <span>Sesión activa</span>
            <strong>{{ runtimeStatus.session.active ? 'Sí' : 'No' }}</strong>
          </div>
          <div>
            <span>Sesión actual</span>
            <strong>{{ runtimeStatus.session.currentSessionId ?? '—' }}</strong>
          </div>
          <div>
            <span>Stream (grabación)</span>
            <strong>{{ runtimeStatus.streams.record.running ? 'Activo' : 'En espera' }}</strong>
          </div>
          <div>
            <span>Stream en vivo</span>
            <strong>{{ runtimeStatus.streams.live.running ? 'Disponible' : 'Inactivo' }}</strong>
          </div>
          <div>
            <span>Actualizado</span>
            <strong>{{ formatTimestamp(runtimeStatus.timestamp) }}</strong>
          </div>
        </div>
        <div v-else class="runtime-empty">
          <p>Sin telemetría del agente. Iniciá el servicio para obtener métricas en tiempo real.</p>
        </div>
      </article>

      <article class="card">
        <header class="card-header">
          <div>
            <h2>Clases a detectar</h2>
            <p class="muted">Seleccioná las clases disponibles del modelo que activan el flujo activo.</p>
          </div>
        </header>

        <div class="classes-summary">
          <div>
            <span>Clases efectivas</span>
            <div class="pill-list" v-if="effectiveClasses.length">
              <span v-for="cls in effectiveClasses" :key="cls" class="pill">{{ cls }}</span>
            </div>
            <p v-else class="muted">Sin clases configuradas (el servicio ignorará detecciones).</p>
          </div>
          <div>
            <span>Override actual</span>
            <div class="pill-list" v-if="selectedClasses.length">
              <span v-for="cls in selectedClasses" :key="`selected-${cls}`" class="pill pill--accent">{{ cls }}</span>
            </div>
            <p v-else class="muted">Sin override: se aplican las clases definidas en <code>config.toml</code>.</p>
          </div>
        </div>

        <div class="classes-actions">
          <button class="btn btn-primary" @click="applyClasses" :disabled="isUpdatingClasses || !managerAvailable">
            {{ isUpdatingClasses ? 'Guardando…' : 'Guardar override' }}
          </button>
          <button class="btn btn-secondary" @click="useDefaults" :disabled="isUpdatingClasses || defaults.length === 0 || !managerAvailable">
            Usar defaults
          </button>
          <button class="btn btn-ghost" @click="clearSelection" :disabled="isUpdatingClasses || selectedClasses.length === 0 || !managerAvailable">
            Limpiar override
          </button>
        </div>

        <p v-if="classesFeedback" :class="['help-text', classesFeedback.type === 'error' ? 'help-text--error' : 'help-text--success']">
          {{ classesFeedback.message }}
        </p>
        <p v-else-if="managerAvailable" class="help-text">Aplicá los cambios y reiniciá el servicio para que el agente tome el nuevo filtro.</p>
        <p v-else class="help-text help-text--error">Gestión de clases no disponible sin el supervisor en ejecución.</p>

        <p v-if="classesError" class="help-text help-text--error">{{ classesError }}</p>

        <div class="catalog">
          <header>
            <h3>Catálogo de clases</h3>
            <span class="muted">{{ catalog.length }} clases disponibles</span>
          </header>
          <div class="catalog-grid">
            <label
              v-for="cls in catalog"
              :key="`catalog-${cls}`"
              class="catalog-item"
            >
              <input
                type="checkbox"
                :checked="isClassSelected(cls)"
                :disabled="!managerAvailable"
                @change="toggleClass(cls)"
              />
              <span>{{ cls }}</span>
            </label>
          </div>
        </div>
      </article>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import WebRtcPlayer from '@/components/live/WebRtcPlayer.vue'
import { edgeAgentService } from '@/api/services'
import { HttpError } from '@/api/http'
import { useWebRtcState } from '@/composables'
import type {
  EdgeAgentClassesConfig,
  EdgeAgentManagerSnapshot,
  EdgeAgentRuntimeStatus,
  EdgeAgentStatusEnvelope,
} from '@/api/schemas/status.schemas'
import { formatDuration, formatTimestamp } from '@/utils/date'

type Feedback = {
  type: 'success' | 'error'
  message: string
}

// WebRTC state for coordinated loading feedback
const { isWebRtcConnected, isWebRtcLoading } = useWebRtcState()

const status = ref<EdgeAgentStatusEnvelope | null>(null)
const statusError = ref<string | null>(null)
const isStatusLoading = ref(false)

const classesConfig = ref<EdgeAgentClassesConfig | null>(null)
const classesError = ref<string | null>(null)
const classesFeedback = ref<Feedback | null>(null)
const selectedClasses = ref<string[]>([])
const isUpdatingClasses = ref(false)

const catalog = ref<string[]>([])
const isMutating = ref(false)
let pollHandle: number | null = null
const managerAvailable = ref(true)

const managerStatus = computed<EdgeAgentManagerSnapshot | null>(() => status.value?.manager ?? null)
const runtimeStatus = computed<EdgeAgentRuntimeStatus | null>(() => status.value?.agent ?? null)

const serviceState = computed(() => managerStatus.value?.state ?? 'idle')

const serviceStatusClass = computed(() => {
  // Only show "connected" (green) when WebRTC is actually connected
  if (serviceState.value === 'running' && isWebRtcConnected.value) {
    return { 'status--connected': true }
  }
  
  // Show "loading" (yellow) when starting, stopping, or waiting for WebRTC
  if (serviceState.value === 'starting' || serviceState.value === 'stopping') {
    return { 'status--loading': true }
  }
  
  if (serviceState.value === 'running' && !isWebRtcConnected.value) {
    // If WebRTC is actively trying to connect, show loading
    if (isWebRtcLoading.value) {
      return { 'status--loading': true }
    }
    // If service is running but WebRTC hasn't started connecting yet, show loading
    return { 'status--loading': true }
  }
  
  // Show error state
  if (serviceState.value === 'error') {
    return { 'status--error': true }
  }
  
  // Default: offline
  return { 'status--offline': true }
})

const serviceStateLabel = computed(() => {
  switch (serviceState.value) {
    case 'running':
      // Show appropriate loading message if WebRTC is not connected yet
      if (!isWebRtcConnected.value) {
        if (isWebRtcLoading.value) {
          return 'Conectando al stream…'
        }
        return 'Esperando conexión…'
      }
      return 'Servicio en ejecución'
    case 'starting':
      return 'Iniciando servicio…'
    case 'stopping':
      return 'Deteniendo servicio…'
    case 'error':
      return 'Error en servicio'
    default:
      return 'Servicio detenido'
  }
})

const uptimeText = computed(() => {
  const uptime = managerStatus.value?.childUptimeMs
  if (!uptime || uptime <= 0) return '—'
  return formatDuration(Math.max(1, Math.floor(uptime / 1000)))
})

const lastStartText = computed(() => {
  const ts = managerStatus.value?.lastStartTs
  return ts ? formatTimestamp(ts) : '—'
})

const lastStopText = computed(() => {
  const ts = managerStatus.value?.lastStopTs
  return ts ? formatTimestamp(ts) : '—'
})

const lastExitText = computed(() => {
  const exit = managerStatus.value?.lastExit
  if (!exit) return 'Sin registros'
  const details: string[] = []
  if (exit.code !== null) {
    details.push(`code ${exit.code}`)
  }
  if (exit.signal) {
    details.push(exit.signal)
  }
  const reason = details.length ? details.join(' · ') : '—'
  return `${formatTimestamp(exit.at)} (${reason})`
})

const effectiveClasses = computed(() => classesConfig.value?.effective ?? [])
const defaults = computed(() => classesConfig.value?.defaults ?? [])

const startDisabled = computed(
  () => !managerAvailable.value || serviceState.value === 'running' || serviceState.value === 'starting' || isMutating.value
)
const stopDisabled = computed(
  () => !managerAvailable.value || serviceState.value === 'idle' || serviceState.value === 'stopping' || isMutating.value
)

const refreshStatus = async () => {
  if (isStatusLoading.value) return
  isStatusLoading.value = true
  try {
    const snapshot = await edgeAgentService.getStatus()
    status.value = snapshot
    statusError.value = null
    if (snapshot.manager.statusPort === 0) {
      managerAvailable.value = false
    }
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : 'No se pudo recuperar el estado'
  } finally {
    isStatusLoading.value = false
  }
}

const loadClasses = async () => {
  try {
    const config = await edgeAgentService.getClasses()
    classesConfig.value = config
    selectedClasses.value = [...config.overrides.classesFilter]
    classesError.value = null
    managerAvailable.value = true
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) {
      classesError.value = 'El supervisor no está corriendo en este endpoint.'
      managerAvailable.value = false
    } else {
      classesError.value = err instanceof Error ? err.message : 'No se pudieron obtener las clases'
    }
  }
}

const loadCatalog = async () => {
  try {
    const { classes } = await edgeAgentService.getCatalog()
    catalog.value = [...classes].sort()
  } catch (err) {
    if (err instanceof Error && err.message.includes('supervisor')) {
      managerAvailable.value = false
    }
    catalog.value = []
  }
}

const startAgent = async () => {
  if (!managerAvailable.value) {
    statusError.value = 'Supervisor no disponible. Iniciá el manager para controlar el servicio.'
    return
  }
  if (startDisabled.value) {
    statusError.value = 'Supervisor no disponible. Iniciá el manager para controlar el servicio.'
    return
  }
  isMutating.value = true
  statusError.value = null
  classesFeedback.value = null

  try {
    // Simple start without wait - let WebRTC player indicate readiness
    await edgeAgentService.start()
    await refreshStatus()
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : 'No se pudo iniciar el servicio'
    if (err instanceof Error && err.message.includes('supervisor')) {
      managerAvailable.value = false
    }
  } finally {
    isMutating.value = false
  }
}

const stopAgent = async () => {
  if (!managerAvailable.value) {
    statusError.value = 'Supervisor no disponible. Iniciá el manager para controlar el servicio.'
    return
  }
  if (stopDisabled.value) {
    statusError.value = 'Supervisor no disponible. Iniciá el manager para controlar el servicio.'
    return
  }
  isMutating.value = true
  classesFeedback.value = null
  try {
    const manager = await edgeAgentService.stop()
    status.value = {
      manager,
      agent: status.value?.agent ?? null,
    }
    await refreshStatus()
  } catch (err) {
    statusError.value = err instanceof Error ? err.message : 'No se pudo detener el servicio'
    if (err instanceof Error && err.message.includes('supervisor')) {
      managerAvailable.value = false
    }
  } finally {
    isMutating.value = false
  }
}

const normalizedSelection = () => {
  return Array.from(new Set(selectedClasses.value.map((cls) => cls.trim().toLowerCase()).filter(Boolean))).sort()
}

const applyClasses = async () => {
  if (!managerAvailable.value) {
    classesFeedback.value = {
      type: 'error',
      message: 'No podés guardar overrides sin el supervisor en ejecución.',
    }
    return
  }
  if (isUpdatingClasses.value) return
  isUpdatingClasses.value = true
  classesFeedback.value = null
  try {
    const payload = await edgeAgentService.updateClasses(normalizedSelection())
    classesConfig.value = payload
    selectedClasses.value = [...payload.overrides.classesFilter]
    classesFeedback.value = {
      type: 'success',
      message: 'Override guardado. Reiniciá el servicio para aplicar los cambios.',
    }
  } catch (err) {
    classesFeedback.value = {
      type: 'error',
      message: err instanceof Error ? err.message : 'No se pudo guardar el override',
    }
    if (err instanceof Error && err.message.includes('supervisor')) {
      managerAvailable.value = false
    }
  } finally {
    isUpdatingClasses.value = false
  }
}

const clearSelection = () => {
  if (!managerAvailable.value) return
  selectedClasses.value = []
}

const useDefaults = () => {
  if (!classesConfig.value || !managerAvailable.value) return
  selectedClasses.value = [...classesConfig.value.defaults]
}

const isClassSelected = (cls: string) => selectedClasses.value.includes(cls)

const toggleClass = (cls: string) => {
  if (!managerAvailable.value) return
  const normalized = cls.trim().toLowerCase()
  if (!normalized) return

  if (selectedClasses.value.includes(normalized)) {
    selectedClasses.value = selectedClasses.value.filter((item) => item !== normalized)
  } else {
    selectedClasses.value = [...selectedClasses.value, normalized]
  }
}

const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return '0s'
  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return `${diffSeconds}s`
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

onMounted(() => {
  void refreshStatus()
  void loadClasses()
  void loadCatalog()
  pollHandle = window.setInterval(() => {
    void refreshStatus()
  }, 5000)
})

watch(
  () => managerStatus.value?.state,
  (state) => {
    if (state === 'error') {
      statusError.value = 'El agente falló al iniciar. Revisá los logs y probá nuevamente.'
    } else if (statusError.value && statusError.value.startsWith('El agente falló')) {
      statusError.value = null
    }
  }
)

onUnmounted(() => {
  if (pollHandle) {
    window.clearInterval(pollHandle)
    pollHandle = null
  }
})
</script>

<style scoped>
.control-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.control-header__actions {
  display: flex;
  gap: 0.75rem;
}

.control-grid {
  display: grid;
  gap: 1.5rem;
}

.live-panel {
  grid-column: 1 / -1;
}

@media (min-width: 1024px) {
  .control-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.card {
  background: rgba(17, 20, 26, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.card-header h2 {
  margin: 0;
  font-size: 1.1rem;
}

.card-header .muted {
  margin: 0.25rem 0 0;
}

.status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.status--connected {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}

.status--loading {
  background: rgba(249, 115, 22, 0.16);
  color: #fb923c;
}

.status--error {
  background: rgba(239, 68, 68, 0.16);
  color: #f87171;
}

.status--offline {
  background: rgba(148, 163, 184, 0.14);
  color: #cbd5f5;
}

.card-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem 1rem;
}

.card-metrics dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.55);
}

.card-metrics dd {
  margin: 0.25rem 0 0;
  font-size: 0.95rem;
  font-weight: 600;
}

.card-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1rem;
}

.runtime-grid span {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.55);
}

.runtime-grid strong {
  margin-top: 0.35rem;
  display: block;
}

.runtime-empty {
  background: rgba(15, 17, 22, 0.9);
  border: 1px dashed rgba(255, 255, 255, 0.08);
  padding: 1rem;
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.65);
}

.classes-summary {
  display: grid;
  gap: 1rem;
}

.classes-summary span {
  display: block;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.55);
}

.pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.35rem;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.18);
  color: #d4d6ff;
  font-size: 0.75rem;
}

.pill--accent {
  background: rgba(14, 165, 233, 0.18);
  color: #bae6fd;
}

.classes-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.catalog {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.catalog header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.catalog-grid {
  display: grid;
  gap: 0.5rem;
  max-height: 260px;
  overflow-y: auto;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

.catalog-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 10px;
  background: rgba(26, 30, 39, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.catalog-item:hover {
  border-color: rgba(94, 234, 212, 0.4);
}

.catalog-item input {
  accent-color: #6366f1;
}

.help-text {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.help-text--error {
  color: #fca5a5;
}

.help-text--success {
  color: #86efac;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 10px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
  flex-shrink: 0;
}

.btn-primary {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.95), rgba(129, 140, 248, 0.9));
  color: #fff;
}

.btn-secondary {
  background: rgba(148, 163, 184, 0.2);
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.btn-ghost {
  background: transparent;
  color: rgba(226, 232, 240, 0.85);
  border: 1px dashed rgba(148, 163, 184, 0.3);
}

.subtitle {
  color: rgba(255, 255, 255, 0.65);
  margin-top: 0.25rem;
}

code {
  background: rgba(15, 17, 24, 0.8);
  padding: 0.1rem 0.3rem;
  border-radius: 6px;
  font-size: 0.75rem;
}
</style>
