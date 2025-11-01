<template>
  <section class="webrtc-player">
    <header class="webrtc-player__header">
      <div>
        <h2>Streaming en vivo</h2>
        <p class="subtitle">
          Visualizá el flujo en tiempo real vía WebRTC (WHEP). La conexión se inicia automáticamente cuando el edge agent está en línea.
        </p>
      </div>
      <div class="status-badges">
        <span class="status" :class="serviceStatusClass">{{ agentStatusText }}</span>
        <span class="status" :class="streamStatusClass">{{ streamStatusText }}</span>
      </div>
    </header>

    <div class="webrtc-player__body">
      <video
        ref="videoElement"
        autoplay
        muted
        playsinline
        controls
        class="webrtc-player__video"
      />
      <div v-if="error" class="webrtc-player__error">
        <strong>Error:</strong> {{ error }}
      </div>
      <div v-else-if="isLoading" class="webrtc-player__loading">
        Conectando con el servidor WebRTC…
      </div>
      <div v-else-if="!agentOnline" class="webrtc-player__info">
        Edge agent sin conexión. Reintentando automáticamente…
        <span v-if="agentStatusError" class="muted">({{ agentStatusError }})</span>
      </div>
    </div>

    <footer class="webrtc-player__footer">
      <div class="actions">
        <button class="btn btn-primary" @click="startStream" :disabled="isLoading || isConnected || !agentOnline">
          Reconectar
        </button>
        <button class="btn btn-secondary" @click="stopStream" :disabled="(!isConnected && !isLoading)">
          Detener
        </button>
        <small class="whep-url">
          WHEP: <code>{{ whepUrl }}</code>
        </small>
        <small class="auto-connect">
          <span class="dot" :class="{ 'dot--active': agentOnline }"></span>
          Auto reconexión {{ agentOnline ? 'habilitada' : 'en espera del edge agent' }}
        </small>
      </div>

      <div v-if="isConnected && stats" class="stats">
        <div><span>Estado</span><strong>{{ connectionState }}</strong></div>
        <div><span>Resolución</span><strong>{{ videoResolution }}</strong></div>
        <div><span>FPS</span><strong>{{ stats.framesPerSecond ?? 'N/A' }}</strong></div>
        <div><span>Bitrate</span><strong>{{ formatBitrate(stats.bitrate ?? 0) }}</strong></div>
        <div><span>Bytes recibidos</span><strong>{{ formatBytes(stats.bytesReceived ?? 0) }}</strong></div>
        <div><span>Packets perdidos</span><strong>{{ stats.packetsLost ?? 0 }}</strong></div>
      </div>

      <div v-if="runtimeStatus" class="agent-insights">
        <div><span>Heartbeat</span><strong>{{ formatRelativeTime(runtimeStatus.heartbeatTs) }}</strong></div>
        <div><span>Última detección</span><strong>{{ formatRelativeTime(runtimeStatus.detections.lastDetectionTs) }}</strong></div>
        <div><span>Detecciones totales</span><strong>{{ runtimeStatus.detections.total }}</strong></div>
        <div><span>Sesión activa</span><strong>{{ runtimeStatus.session.active ? 'Sí' : 'No' }}</strong></div>
        <div><span>Sesión actual</span><strong>{{ runtimeStatus.session.currentSessionId ?? runtimeStatus.session.lastSessionId ?? '—' }}</strong></div>
        <div><span>Grabación</span><strong>{{ runtimeStatus.streams.record.running ? 'Transmisión' : 'En espera' }}</strong></div>
        <div><span>Live stream</span><strong>{{ runtimeStatus.streams.live.running ? 'Encendido' : 'Apagado' }}</strong></div>
        <div><span>Actualizado</span><strong>{{ formatDateTime(runtimeStatus.timestamp) }}</strong></div>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { edgeAgentService } from '@/api/services'
import { BASE_URLS } from '@/api/http'
import { LIVE_STREAM_CONFIG } from '@/constants'
import type {
  EdgeAgentStatusEnvelope,
  EdgeAgentRuntimeStatus,
  EdgeAgentManagerSnapshot,
} from '@/api/schemas/status.schemas'

type IntervalHandle = ReturnType<typeof setInterval> | null

const videoElement = ref<HTMLVideoElement | null>(null)
const peerConnection = ref<RTCPeerConnection | null>(null)

const statusEnvelope = ref<EdgeAgentStatusEnvelope | null>(null)
const agentStatusError = ref<string | null>(null)

const isConnected = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const connectionState = ref<'disconnected' | RTCPeerConnectionState>('disconnected')
const stats = ref<Record<string, number | undefined> | null>(null)

const baseWhepUrl = BASE_URLS.WEBRTC.replace(/\/$/, '')
const streamPath = LIVE_STREAM_CONFIG.PATH.replace(/^\/+/, '')
const whepUrl = computed(() => `${baseWhepUrl}/${streamPath}/whep`)

const managerStatus = computed<EdgeAgentManagerSnapshot | null>(
  () => statusEnvelope.value?.manager ?? null
)

const runtimeStatus = computed<EdgeAgentRuntimeStatus | null>(
  () => statusEnvelope.value?.agent ?? null
)

const serviceState = computed<EdgeAgentManagerSnapshot['state']>(() => {
  return managerStatus.value?.state ?? 'idle'
})

const agentOnline = computed(
  () => serviceState.value === 'running' && runtimeStatus.value !== null
)

const streamStatusState = computed(() => {
  if (!agentOnline.value) return 'offline'
  if (isLoading.value) return 'loading'
  if (isConnected.value) return 'connected'
  if (error.value) return 'error'
  return 'idle'
})

const serviceStatusClass = computed(() => ({
  'status--connected': serviceState.value === 'running',
  'status--loading': serviceState.value === 'starting' || serviceState.value === 'stopping',
  'status--error': serviceState.value === 'error',
  'status--offline': serviceState.value === 'idle',
}))

const streamStatusClass = computed(() => ({
  'status--connected': streamStatusState.value === 'connected',
  'status--loading': streamStatusState.value === 'loading',
  'status--error': streamStatusState.value === 'error',
  'status--offline': streamStatusState.value === 'offline',
}))

const agentStatusText = computed(() => {
  switch (serviceState.value) {
    case 'running':
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

const streamStatusText = computed(() => {
  switch (streamStatusState.value) {
    case 'connected':
      return 'Stream activo'
    case 'loading':
      return 'Conectando…'
    case 'error':
      return error.value ?? 'Error'
    case 'offline':
      return 'Esperando edge agent'
    default:
      return 'Listo'
  }
})

const videoResolution = computed(() => {
  if (!stats.value) return 'N/A'
  const width = stats.value.frameWidth ?? 0
  const height = stats.value.frameHeight ?? 0
  return width && height ? `${width}×${height}` : 'N/A'
})

let statsInterval: IntervalHandle = null
let statusInterval: IntervalHandle = null
let lastVideoStats: { bytesReceived: number; timestamp: number } | null = null
let isFetchingStatus = false

const stopStatsCollection = () => {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
  lastVideoStats = null
}

const startStatsCollection = () => {
  stopStatsCollection()

  statsInterval = setInterval(async () => {
    const pc = peerConnection.value
    if (!pc) return

    try {
      const report = await pc.getStats()
      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
          const bytesReceived = stat.bytesReceived ?? 0
          const timestamp = stat.timestamp ?? performance.now()
          let bitrate = 0

          if (lastVideoStats) {
            const bytesDiff = bytesReceived - lastVideoStats.bytesReceived
            const timeDiff = timestamp - lastVideoStats.timestamp
            if (timeDiff > 0) {
              bitrate = (bytesDiff * 8 * 1000) / timeDiff
            }
          }

          lastVideoStats = { bytesReceived, timestamp }

          stats.value = {
            bytesReceived,
            bitrate,
            packetsLost: stat.packetsLost,
            framesPerSecond: stat.framesPerSecond,
            frameWidth: stat.frameWidth,
            frameHeight: stat.frameHeight,
          }
        }
      })
    } catch (err) {
      console.error('[WebRTC] Error collecting stats', err)
    }
  }, 1000)
}

const stopStatusPolling = () => {
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = null
  }
}

const waitForIceGatheringComplete = (pc: RTCPeerConnection): Promise<void> => {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()

  return new Promise((resolve) => {
    const checkState = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', checkState)
        resolve()
      }
    }

    pc.addEventListener('icegatheringstatechange', checkState)

    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', checkState)
      resolve()
    }, 5000)
  })
}

const fetchAgentStatus = async () => {
  if (isFetchingStatus) return
  isFetchingStatus = true

  try {
    const status = await edgeAgentService.getStatus()
    statusEnvelope.value = status
    agentStatusError.value = null

    if (!isConnected.value && !isLoading.value && agentOnline.value) {
      void startStream()
    }
  } catch (err) {
    statusEnvelope.value = null
    agentStatusError.value = err instanceof Error ? err.message : 'Edge agent no disponible'

    if (isConnected.value || isLoading.value) {
      stopStream()
    }
  } finally {
    isFetchingStatus = false
  }
}

const startStream = async () => {
  if (isLoading.value || isConnected.value || !agentOnline.value) return

  error.value = null
  isLoading.value = true

  try {
    peerConnection.value = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    peerConnection.value.ontrack = (event) => {
      if (videoElement.value && event.streams[0]) {
        videoElement.value.srcObject = event.streams[0]
      }
    }

    peerConnection.value.onconnectionstatechange = () => {
      const state = peerConnection.value?.connectionState ?? 'disconnected'
      connectionState.value = state

      if (state === 'connected') {
        isConnected.value = true
        isLoading.value = false
        startStatsCollection()
      } else if (state === 'failed' || state === 'disconnected') {
        if (isConnected.value) {
          error.value = 'La conexión WebRTC se interrumpió'
        }
        isConnected.value = false
        isLoading.value = false
        stopStatsCollection()
      }
    }

    const offer = await peerConnection.value.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: false,
    })
    await peerConnection.value.setLocalDescription(offer)
    await waitForIceGatheringComplete(peerConnection.value)

    const response = await fetch(whepUrl.value, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        Accept: 'application/sdp',
      },
      body: peerConnection.value.localDescription?.sdp ?? '',
    })

    if (!response.ok) {
      throw new Error(`Servidor WHEP respondió ${response.status} ${response.statusText}`)
    }

    const answerSdp = await response.text()
    await peerConnection.value.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp,
    })
  } catch (err) {
    console.error('[WebRTC] Error establishing connection', err)
    const message = err instanceof Error ? err.message : 'Error desconocido al iniciar WebRTC'
    error.value = message
    isConnected.value = false
    isLoading.value = false
    stopStatsCollection()

    if (peerConnection.value) {
      peerConnection.value.close()
      peerConnection.value = null
    }
  }
}

const stopStream = () => {
  stopStatsCollection()

  if (peerConnection.value) {
    try {
      peerConnection.value.getSenders().forEach((sender) => sender.track?.stop())
      peerConnection.value.close()
    } catch (err) {
      console.warn('[WebRTC] Error closing peer connection', err)
    }
    peerConnection.value = null
  }

  if (videoElement.value) {
    videoElement.value.srcObject = null
  }

  isConnected.value = false
  isLoading.value = false
  connectionState.value = 'disconnected'
  stats.value = null
}

const formatBytes = (bytes: number) => {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const size = bytes / Math.pow(1024, exponent)
  return `${size.toFixed(1)} ${units[exponent]}`
}

const formatBitrate = (bps: number) => {
  if (!bps) return '0 kbps'
  const kbps = bps / 1000
  return `${kbps.toFixed(1)} kbps`
}

const formatRelativeTime = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'en el futuro'
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 2) return 'hace 1s'
  if (diffSec < 60) return `hace ${diffSec}s`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffHours = Math.round(diffMin / 60)
  if (diffHours < 24) return `hace ${diffHours}h`
  const diffDays = Math.round(diffHours / 24)
  return `hace ${diffDays}d`
}

const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

onMounted(() => {
  void fetchAgentStatus()
  statusInterval = setInterval(() => {
    void fetchAgentStatus()
  }, LIVE_STREAM_CONFIG.STATUS_REFRESH_MS)
})

onUnmounted(() => {
  stopStream()
  stopStatusPolling()
})

defineExpose({ startStream, stopStream, whepUrl })
</script>

<style scoped>
.webrtc-player {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  background: rgba(13, 15, 20, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 1.75rem;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.webrtc-player__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.subtitle {
  margin-top: 0.35rem;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.95rem;
}

.status-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6rem;
  align-items: center;
}

.status {
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  font-size: 0.85rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.status--connected {
  background: rgba(46, 204, 113, 0.15);
  border-color: rgba(46, 204, 113, 0.4);
  color: #2ecc71;
}

.status--loading {
  background: rgba(241, 196, 15, 0.12);
  border-color: rgba(241, 196, 15, 0.4);
  color: #f1c40f;
}

.status--error {
  background: rgba(231, 76, 60, 0.12);
  border-color: rgba(231, 76, 60, 0.4);
  color: #e74c3c;
}

.status--offline {
  background: rgba(189, 195, 199, 0.12);
  border-color: rgba(189, 195, 199, 0.35);
  color: #bdc3c7;
}

.webrtc-player__body {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: #050607;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.webrtc-player__video {
  width: 100%;
  max-height: 520px;
  background: #000;
}

.webrtc-player__loading,
.webrtc-player__error,
.webrtc-player__info {
  position: absolute;
  inset: auto 0 0 0;
  padding: 0.75rem 1rem;
  text-align: center;
  font-size: 0.95rem;
  background: rgba(0, 0, 0, 0.65);
}

.webrtc-player__error {
  color: #f66;
}

.webrtc-player__info {
  color: rgba(255, 255, 255, 0.85);
}

.webrtc-player__footer {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.btn {
  border: none;
  border-radius: 999px;
  padding: 0.55rem 1.5rem;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #4f46e5, #6366f1);
  color: #fff;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.whep-url {
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.85rem;
}

.whep-url code {
  background: rgba(255, 255, 255, 0.08);
  padding: 0.2rem 0.45rem;
  border-radius: 6px;
}

.auto-connect {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.85rem;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  transition: background 0.2s ease;
}

.dot--active {
  background: #2ecc71;
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
  font-size: 0.9rem;
}

.stats span {
  display: block;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 0.2rem;
}

.stats strong {
  font-weight: 600;
}

.agent-insights {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  font-size: 0.9rem;
}

.agent-insights span {
  display: block;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 0.2rem;
}

.agent-insights strong {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.muted {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.45);
  display: block;
  margin-top: 0.2rem;
}

@media (max-width: 768px) {
  .webrtc-player {
    padding: 1.25rem;
  }

  .webrtc-player__header {
    flex-direction: column;
    gap: 0.75rem;
  }

  .status-badges {
    justify-content: flex-start;
  }
}
</style>
