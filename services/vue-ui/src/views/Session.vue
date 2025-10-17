<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import Player from '../components/Player.vue';
import TrackLegend from '../components/TrackLegend.vue';
import { fetchSessionClip } from '../api/sessions';
import { usePlayerStore } from '../stores/usePlayer';
import { useSessionsStore } from '../stores/useSessions';
import { useTracksStore } from '../stores/useTracks';

const props = defineProps<{
  sessionId: string;
}>();

const sessionsStore = useSessionsStore();
const tracksStore = useTracksStore();
const playerStore = usePlayerStore();

const clipLoading = ref(false);
const clipError = ref<string | null>(null);
const playbackUrl = ref<string | null>(null);

const { meta, index, metaMissing, indexMissing, hasSegments } = storeToRefs(tracksStore);

const metaReady = computed(() => meta.value !== null || metaMissing.value);
const indexReady = computed(() => hasSegments.value || indexMissing.value);
const layoutReady = computed(() => metaReady.value && indexReady.value);
const overlaysAvailable = computed(() => hasSegments.value && meta.value !== null);
const warnings = computed(() => {
  const items: string[] = [];
  if (metaMissing.value) {
    items.push('No se encontró meta.json; se usará la información básica del clip.');
  }
  if (indexMissing.value) {
    items.push('No se encontró index.json; las anotaciones no estarán disponibles.');
  }
  return items;
});

const loadSessionData = async (sessionId: string) => {
  clipError.value = null;
  clipLoading.value = true;
  try {
    await tracksStore.resetForSession(sessionId);
    await Promise.all([tracksStore.loadMeta(sessionId), tracksStore.loadIndex(sessionId)]);

    const clip = await fetchSessionClip(sessionId);
    playbackUrl.value = clip.playbackUrl;
    playerStore.setSession(sessionId);
    playerStore.setPlaybackSource(clip.playbackUrl);

    if (hasSegments.value && meta.value) {
      const initialSegment = tracksStore.segmentIndexForTime(0) ?? 0;
      await tracksStore.ensureSegment(sessionId, initialSegment);
      tracksStore.prefetchAround(initialSegment);
    }
  } catch (error) {
    console.error('Failed to initialize session view', error);
    clipError.value =
      error instanceof Error ? error.message : 'No se pudo cargar la sesión seleccionada.';
  } finally {
    clipLoading.value = false;
  }
};

watch(
  () => props.sessionId,
  (id) => {
    if (!id) return;
    sessionsStore.selectSession(id);
    void loadSessionData(id);
  },
  { immediate: true }
);

watch(
  overlaysAvailable,
  (active) => {
    if (!active || !meta.value || !props.sessionId) return;
    const currentSegment = tracksStore.segmentIndexForTime(playerStore.currentTime) ?? 0;
    void tracksStore.ensureSegment(props.sessionId, currentSegment).catch((err) =>
      console.debug('Segment ensure on overlay activation failed', err)
    );
    tracksStore.prefetchAround(currentSegment);
  }
);

const showLoading = computed(() => clipLoading.value || !layoutReady.value);
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
        <p v-for="warn in warnings" :key="warn">⚠️ {{ warn }}</p>
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
              <template v-else>
                —
              </template>
            </dd>
          </div>
          <div>
            <dt>FPS (tracking)</dt>
            <dd>{{ index ? index.fps.toFixed(1) : '—' }}</dd>
          </div>
        </dl>
      </div>
      <TrackLegend :meta="meta" :meta-missing="metaMissing" :index-missing="indexMissing" :disabled="!overlaysAvailable" />
    </aside>
  </section>
  <section v-else class="session-view loading-state">
    <p v-if="clipError">⚠️ {{ clipError }}</p>
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
