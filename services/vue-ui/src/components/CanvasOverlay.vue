<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TrackMeta } from '../types/tracks'
import { usePlayerStore } from '../stores/usePlayer'
import { useTracksStore } from '../stores/useTracks'

/**
 * CanvasOverlay: dibuja las anotaciones (cajas, etiquetas y trayectorias)
 * sobre el elemento <video>.
 * Props:
 * - `videoEl`: referencia al HTMLVideoElement sobre el que renderizar
 * - `meta`: metadata de la sesión (para conocer clases, etc.)
 *
 * Render:
 * - Se ejecuta en requestAnimationFrame para sincronizar con la tasa de refresco.
 * - Obtiene objetos actuales y trails desde `tracksStore.eventsAtTime(time)`.
 */
const props = defineProps<{
  videoEl: HTMLVideoElement | null
  meta: TrackMeta
}>()

const playerStore = usePlayerStore()
const tracksStore = useTracksStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

let frameHandle = 0

// Color determinista por id de track
const colorForTrack = (trackId: number) => {
  const hue = (trackId * 47) % 360
  return `hsl(${hue}, 80%, 60%)`
}

// Asegura tamaño del canvas respetando devicePixelRatio
const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const dpr = window.devicePixelRatio || 1
  const displayWidth = Math.floor(width)
  const displayHeight = Math.floor(height)
  if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
    canvas.width = displayWidth * dpr
    canvas.height = displayHeight * dpr
    canvas.style.width = `${displayWidth}px`
    canvas.style.height = `${displayHeight}px`
  }
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
  }
}

const drawFrame = () => {
  frameHandle = requestAnimationFrame(drawFrame)

  const canvas = canvasRef.value
  const video = props.videoEl

  if (!canvas || !video) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = video.clientWidth || video.videoWidth
  const height = video.clientHeight || video.videoHeight
  if (width === 0 || height === 0) return

  ensureCanvasSize(canvas, width, height)

  ctx.clearRect(0, 0, width, height)

  const time = playerStore.currentTime
  const { current, trails } = tracksStore.eventsAtTime(time)

  // Dibujar trails (trayectorias) si están habilitadas
  if (tracksStore.showTrails) {
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    trails.forEach((points, trackId) => {
      if (points.length < 2) return
      const color = colorForTrack(trackId)
      ctx.strokeStyle = color
      ctx.beginPath()
      points.forEach((point, index) => {
        const [x1, y1, x2, y2] = point.bbox
        const cx = (x1 + x2) / 2
        const cy = (y1 + y2) / 2
        const px = cx * width
        const py = cy * height
        if (index === 0) {
          ctx.moveTo(px, py)
        } else {
          ctx.lineTo(px, py)
        }
      })
      ctx.stroke()
    })
    ctx.setLineDash([])
  }

  // Dibujar cajas y etiquetas si están habilitadas
  if (tracksStore.showBoxes) {
    current.forEach((item) => {
      const [x1, y1, x2, y2] = item.bbox
      const boxWidth = (x2 - x1) * width
      const boxHeight = (y2 - y1) * height
      if (boxWidth <= 0 || boxHeight <= 0) return
      const px1 = x1 * width
      const py1 = y1 * height
      const color = colorForTrack(item.trackId)
      
      // Ajustar grosor y opacidad según confianza
      // Confianza alta (>0.7) → grosor 3, opacidad 1.0
      // Confianza media (0.4-0.7) → grosor 2, opacidad 0.8
      // Confianza baja (<0.4) → grosor 1.5, opacidad 0.6
      const lineWidth = item.conf > 0.7 ? 3 : item.conf > 0.4 ? 2 : 1.5
      const opacity = item.conf > 0.7 ? 1.0 : item.conf > 0.4 ? 0.8 : 0.6
      
      ctx.lineWidth = lineWidth
      ctx.globalAlpha = opacity
      ctx.strokeStyle = color
      ctx.strokeRect(px1, py1, boxWidth, boxHeight)
      ctx.globalAlpha = 1.0  // Reset alpha

      if (tracksStore.showLabels) {
        const label = `#${item.trackId} ${item.clsName} ${(item.conf * 100).toFixed(0)}%`
        ctx.font = '12px "Inter", system-ui'
        ctx.textBaseline = 'top'
        const padding = 4
        const metrics = ctx.measureText(label)
        const textWidth = metrics.width
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
        const rectWidth = textWidth + padding * 2
        const rectHeight = 16
        ctx.fillRect(px1, py1 - rectHeight, rectWidth, rectHeight)
        ctx.fillStyle = color
        ctx.fillText(label, px1 + padding, py1 - rectHeight + 2)
      }
    })
  }
}

onMounted(() => {
  frameHandle = requestAnimationFrame(drawFrame)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frameHandle)
})

// Si el video es removido, limpiar el canvas
watch(
  () => props.videoEl,
  () => {
    if (!props.videoEl) {
      const canvas = canvasRef.value
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }
  },
)
</script>

<template>
  <canvas ref="canvasRef" class="overlay"></canvas>
</template>

<style scoped>
.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
