<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import type { TrackIndex, TrackMeta } from '../types/tracks'
import CanvasOverlay from './CanvasOverlay.vue'
import { usePlayerStore } from '../stores/usePlayer'
import { useTracksStore } from '../stores/useTracks'

/**
 * Componente Player
 * Props:
 * - `sessionId`: id de la sesión actual
 * - `playbackUrl`: URL del video a reproducir
 * - `meta`, `index`: información de anotaciones/segmentos
 * - `overlaysEnabled`: flag para permitir overlays (canvas)
 *
 * Comportamiento clave:
 * - Adjunta el elemento <video> al `usePlayer` store para sincronizar tiempo y control.
 * - Observa `playerStore.currentTime` y solicita `tracksStore.ensureSegment` para cargar
 *   los segmentos necesarios cuando el tiempo cambia.
 */
const props = defineProps<{
  sessionId: string
  playbackUrl: string | null
  meta: TrackMeta | null
  index: TrackIndex | null
  overlaysEnabled?: boolean
  loading?: boolean
  error?: string | null
}>()

const playerStore = usePlayerStore()
const tracksStore = useTracksStore()
const { hasSegments } = storeToRefs(tracksStore)

const videoRef = ref<HTMLVideoElement | null>(null)
// overlaysActive = true solo si overlaysEnabled, meta e index están presentes y hay segmentos
const overlaysActive = computed(() => {
  const overlaysFlag = props.overlaysEnabled ?? true
  return Boolean(overlaysFlag && props.meta && props.index && hasSegments.value)
})

// Cuando el componente se monta, asociamos el elemento video al store
onMounted(() => {
  if (videoRef.value) {
    playerStore.attachVideo(videoRef.value)
  }
})

// Actualizar fuente cuando cambie la prop playbackUrl
watch(
  () => props.playbackUrl,
  (url) => {
    playerStore.setPlaybackSource(url ?? null)
  },
)

// Cada vez que cambia el tiempo actual, aseguramos que el segmento correspondiente esté cargado
watch(
  () => playerStore.currentTime,
  (time) => {
    if (!props.sessionId || !overlaysActive.value) return
    const segmentIndex = tracksStore.segmentIndexForTime(time)
    if (segmentIndex != null) {
      void tracksStore
        .ensureSegment(props.sessionId, segmentIndex)
        .catch((err) => console.debug('Segment ensure failed', err))
      tracksStore.prefetchAround(segmentIndex)
    }
  },
)

// Al desmontar, desasociar el video del store
onBeforeUnmount(() => {
  playerStore.attachVideo(null)
})
</script>

<template>
  <div class="player">
    <div class="player__surface">
      <video ref="videoRef" controls playsinline preload="auto" />
      <CanvasOverlay v-if="videoRef && overlaysActive && meta" :video-el="videoRef" :meta="meta" />
      <div v-if="loading" class="player__overlay">Cargando clip…</div>
      <div v-else-if="error" class="player__overlay error">{{ error }}</div>
    </div>
  </div>
</template>

<style scoped>
.player {
  width: 100%;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 0.75rem;
  overflow: hidden;
  position: relative;
}

.player__surface {
  position: relative;
  width: 100%;
  background: #000;
}

video {
  display: block;
  width: 100%;
  background: #000;
}

.player__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: #f1f3f5;
  font-weight: 500;
  font-size: 1.1rem;
}

.player__overlay.error {
  color: #ff8787;
}
</style>
