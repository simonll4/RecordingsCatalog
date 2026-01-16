<script setup lang="ts">
/**
 * Vista de sesión:
 * - Al recibir `sessionId` carga meta/index y el clip.
 * - Inicializa el `usePlayer` con la URL de playback.
 * - Asegura el primer segmento y prefetch si hay overlays disponibles.
 * - Observa cambios en `playerStore.currentTime` (vía Player) para cargar
 *   segmentos bajo demanda (esto se hace desde Player/Tracks store).
 */
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import Player from '../components/Player.vue'
import TrackLegend from '../components/TrackLegend.vue'
import { playbackService, sessionService } from '@/api'
import type { SessionSummary } from '@/api'
import { usePlayerStore } from '../stores/usePlayer'
import { useSessionsStore } from '../stores/useSessions'
import { useTracksStore } from '../stores/useTracks'

const props = defineProps<{
  sessionId: string
}>()

const sessionsStore = useSessionsStore()
const tracksStore = useTracksStore()
const playerStore = usePlayerStore()

const clipLoading = ref(false)
const clipError = ref<string | null>(null)
const playbackUrl = ref<string | null>(null)
const sessionRecord = ref<SessionSummary | null>(null)

const { meta, index, metaMissing, indexMissing, hasSegments } = storeToRefs(tracksStore)

const metaReady = computed(() => meta.value !== null || metaMissing.value)
const indexReady = computed(() => hasSegments.value || indexMissing.value)
const layoutReady = computed(() => metaReady.value && indexReady.value)
const overlaysAvailable = computed(() => hasSegments.value && meta.value !== null)
const warnings = computed(() => {
  const items: string[] = []
  if (metaMissing.value) {
    items.push('No se encontró meta.json; se usará la información básica del clip.')
  }
  if (indexMissing.value) {
    items.push('No se encontró index.json; las anotaciones no estarán disponibles.')
  }
  return items
})

const configuredClasses = computed(() => sessionRecord.value?.configured_classes ?? [])
const detectedClasses = computed(() => sessionRecord.value?.detected_classes ?? [])
const detectedSet = computed(() => new Set(detectedClasses.value))
const configuredSet = computed(() => new Set(configuredClasses.value))
const configuredMissing = computed(() =>
  configuredClasses.value.filter((cls) => !detectedSet.value.has(cls)),
)
const detectedExtra = computed(() =>
  detectedClasses.value.filter((cls) => !configuredSet.value.has(cls)),
)

const loadSessionData = async (sessionId: string) => {
  clipError.value = null
  clipLoading.value = true
  sessionRecord.value = null
  try {
    // Limpiar estado y cache de la sesión anterior
    await tracksStore.resetForSession(sessionId)
    // Cargar meta, index y datos de sesión en paralelo
    const [session] = await Promise.all([
      sessionService.getSession(sessionId),
      tracksStore.loadMeta(sessionId),
      tracksStore.loadIndex(sessionId),
    ])
    sessionRecord.value = session

    // Intentar construir URL localmente usando media_start_ts
    let clip = playbackService.buildSessionPlaybackUrl(session)
    let finalClip: typeof clip

    // Si no se pudo construir (sesión abierta o datos incompletos), error
    if (!clip) {
      throw new Error('Session is still open or incomplete, cannot generate playback URL')
    } else if (clip.anchorSource === 'fallback_offset') {
      // Si usamos fallback (sin media_start_ts), validar que la URL existe
      console.warn('[loadSessionData] No media_start_ts found, probing playback URL...')
      const probeResult = await playbackService.probePlaybackUrl(
        session.path ?? session.device_id,
        new Date(clip.start),
        clip.duration,
        5, // max 5 reintentos = 1s de ajuste
      )

      if (probeResult) {
        console.log('[loadSessionData] Probe successful, using adjusted URL')
        finalClip = {
          ...clip,
          playbackUrl: probeResult.url,
          start: probeResult.adjustedStart,
        }
      } else {
        throw new Error('Failed to probe playback URL, video may not be available')
      }
    } else {
      // clip exists and doesn't need probing
      finalClip = clip
    }

    // Calcular overlay shift: diferencia entre el inicio del video (finalClip.start) y meta.start_time
    if (meta.value && finalClip.start) {
      const videoStartMs = new Date(finalClip.start).getTime()
      const metaStartMs = new Date(meta.value.start_time).getTime()
      const shiftSeconds = (videoStartMs - metaStartMs) / 1000
      const shiftMs = Math.round(shiftSeconds * 1000)

      tracksStore.setOverlayShift(shiftSeconds)

      // Log estructurado para observabilidad
      console.log(
        JSON.stringify({
          event: 'overlay_alignment',
          sessionId,
          videoStart: finalClip.start,
          metaStart: meta.value.start_time,
          shiftSeconds: parseFloat(shiftSeconds.toFixed(3)),
          shiftMs,
          anchorSource: finalClip.anchorSource || 'unknown',
        }),
      )

      // Validación: shift excesivo indica problema de sincronización
      if (Math.abs(shiftSeconds) > 2) {
        console.warn(
          `[overlay_alignment] Large shift detected: ${shiftSeconds.toFixed(3)}s - possible timing issue`,
        )
        console.warn(
          `This may indicate desync between MediaMTX recordings and AI worker timestamps`,
        )
      }
    }

    playbackUrl.value = finalClip.playbackUrl
    playerStore.setSession(sessionId)
    playerStore.setPlaybackSource(finalClip.playbackUrl)

    // Si hay segmentos e información de meta, asegurar el segmento inicial
    if (hasSegments.value && meta.value) {
      const initialSegment = tracksStore.segmentIndexForTime(0) ?? 0
      await tracksStore.ensureSegment(sessionId, initialSegment)
      tracksStore.prefetchAround(initialSegment)
    }
  } catch (error) {
    console.error('Failed to initialize session view', error)
    clipError.value =
      error instanceof Error ? error.message : 'No se pudo cargar la sesión seleccionada.'
    sessionRecord.value = null
  } finally {
    clipLoading.value = false
  }
}

// Reaccionar a cambios en la prop sessionId: seleccionar y cargar datos
watch(
  () => props.sessionId,
  (id) => {
    if (!id) return
    sessionsStore.selectSession(id)
    void loadSessionData(id)
  },
  { immediate: true },
)

// Cuando overlays se activan, asegurar el segmento relacionado con el tiempo actual
watch(overlaysAvailable, (active) => {
  if (!active || !meta.value || !props.sessionId) return
  const currentSegment = tracksStore.segmentIndexForTime(playerStore.currentTime) ?? 0
  void tracksStore
    .ensureSegment(props.sessionId, currentSegment)
    .catch((err) => console.debug('Segment ensure on overlay activation failed', err))
  tracksStore.prefetchAround(currentSegment)
})

const showLoading = computed(() => clipLoading.value || !layoutReady.value)
</script>

<template>
  <section class="session-view" v-if="!showLoading">
    <div class="player-column">
      <Player
        :session-id="sessionId"
        :playback-url="playbackUrl"
        :meta="meta"
        :index="index"
        :overlays-enabled="overlaysAvailable"
        :loading="clipLoading"
        :error="clipError"
      />
      <div v-if="warnings.length" class="alert" role="status">
        <p v-for="warn in warnings" :key="warn">{{ warn }}</p>
      </div>
    </div>
    <aside class="sidebar">
      <div class="meta-card">
        <h1>{{ sessionId }}</h1>
        <dl>
          <div>
            <dt>Dispositivo</dt>
            <dd>{{ meta?.device_id ?? 'Desconocido' }}</dd>
          </div>
          <div>
            <dt>Inicio</dt>
            <dd>{{ meta ? new Date(meta.start_time).toLocaleString() : '—' }}</dd>
          </div>
          <div>
            <dt>Fin</dt>
            <dd>
              <template v-if="meta">
                {{ meta.end_time ? new Date(meta.end_time).toLocaleString() : 'En curso' }}
              </template>
              <template v-else> — </template>
            </dd>
          </div>
        </dl>
      </div>
      <div
        v-if="configuredClasses.length || detectedClasses.length"
        class="meta-card class-card"
      >
        <div class="class-card__header">
          <h2>Objetos relevantes</h2>
          <p class="class-card__summary">
            {{ detectedClasses.length }} detectada(s) · {{ configuredClasses.length }} configurada(s)
          </p>
        </div>
        <div v-if="configuredClasses.length" class="class-card__group">
          <span class="group-label">Configuradas</span>
          <div class="class-tags">
            <span
              v-for="className in configuredClasses"
              :key="`cfg-${sessionId}-${className}`"
              class="class-tag"
              :class="detectedSet.has(className) ? 'class-tag--hit' : 'class-tag--pending'"
            >
              <span class="tag-name">{{ className }}</span>
            </span>
          </div>
        </div>
        <div v-if="detectedClasses.length" class="class-card__group">
          <span class="group-label">Detectadas</span>
          <div class="class-tags">
            <span
              v-for="className in detectedClasses"
              :key="`det-${sessionId}-${className}`"
              class="class-tag"
              :class="configuredSet.has(className) ? 'class-tag--hit' : 'class-tag--extra'"
            >
              <span class="tag-name">{{ className }}</span>
            </span>
          </div>
        </div>
        <p v-if="configuredMissing.length" class="class-card__note">
          {{ configuredMissing.length }} clase(s) configurada(s) no se detectaron en esta sesión.
        </p>
        <p v-if="detectedExtra.length" class="class-card__note class-card__note--extra">
          {{ detectedExtra.length }} detección(es) fuera del filtro configurado.
        </p>
      </div>
      <TrackLegend
        :meta="meta"
        :meta-missing="metaMissing"
        :index-missing="indexMissing"
        :disabled="!overlaysAvailable"
      />
    </aside>
  </section>
  <section v-else class="session-view loading-state">
    <p v-if="clipError">{{ clipError }}</p>
    <p v-else>Cargando sesión…</p>
  </section>
</template>

<style scoped>
.session-view {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
  gap: 1.5rem;
  align-items: flex-start;
}

.player-column {
  min-width: 0;
}

.alert {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  border-left: 3px solid #ffd43b;
  background: rgba(255, 212, 59, 0.1);
  color: #ffd43b;
  display: grid;
  gap: 0.35rem;
}

.alert p {
  margin: 0;
  font-size: 0.9rem;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: sticky;
  top: 1rem;
}

.meta-card {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.meta-card h1 {
  margin: 0;
  font-size: 1.1rem;
}

.meta-card h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.meta-card dl {
  display: grid;
  gap: 0.5rem;
  margin: 0;
}

.meta-card dt {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
}

.meta-card dd {
  margin: 0;
}

.class-card {
  gap: 0.75rem;
}

.class-card__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.class-card__summary {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
}

.class-card__group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.group-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
}

.class-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
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

.class-card__note {
  margin: 0;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.class-card__note--extra {
  color: rgba(255, 135, 245, 0.78);
}

.loading-state {
  justify-content: center;
  align-items: center;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.7);
}

@media (max-width: 1024px) {
  .session-view {
    grid-template-columns: 1fr;
  }

  .sidebar {
    position: static;
  }
}
</style>
