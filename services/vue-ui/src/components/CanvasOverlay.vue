<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { TrackMeta } from '../types/tracks';
import { usePlayerStore } from '../stores/usePlayer';
import { useTracksStore } from '../stores/useTracks';

const props = defineProps<{
  videoEl: HTMLVideoElement | null;
  meta: TrackMeta;
}>();

const playerStore = usePlayerStore();
const tracksStore = useTracksStore();
const canvasRef = ref<HTMLCanvasElement | null>(null);

let frameHandle = 0;

const colorForTrack = (trackId: number) => {
  const hue = (trackId * 47) % 360;
  return `hsl(${hue}, 80%, 60%)`;
};

const ensureCanvasSize = (canvas: HTMLCanvasElement, width: number, height: number) => {
  const dpr = window.devicePixelRatio || 1;
  const displayWidth = Math.floor(width);
  const displayHeight = Math.floor(height);
  if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
  }
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
};

const drawFrame = () => {
  frameHandle = requestAnimationFrame(drawFrame);

  const canvas = canvasRef.value;
  const video = props.videoEl;

  if (!canvas || !video) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = video.clientWidth || video.videoWidth;
  const height = video.clientHeight || video.videoHeight;
  if (width === 0 || height === 0) return;

  ensureCanvasSize(canvas, width, height);

  ctx.clearRect(0, 0, width, height);

  const time = playerStore.currentTime;
  const { current, trails } = tracksStore.eventsAtTime(time);

  if (tracksStore.showTrails) {
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    trails.forEach((points, trackId) => {
      if (points.length < 2) return;
      const color = colorForTrack(trackId);
      ctx.strokeStyle = color;
      ctx.beginPath();
      points.forEach((point, index) => {
        const [x1, y1, x2, y2] = point.bbox;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const px = cx * width;
        const py = cy * height;
        if (index === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      });
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  if (tracksStore.showBoxes) {
    ctx.lineWidth = 2;
    current.forEach((item) => {
      const [x1, y1, x2, y2] = item.bbox;
      const boxWidth = (x2 - x1) * width;
      const boxHeight = (y2 - y1) * height;
      if (boxWidth <= 0 || boxHeight <= 0) return;
      const px1 = x1 * width;
      const py1 = y1 * height;
      const color = colorForTrack(item.trackId);
      ctx.strokeStyle = color;
      ctx.strokeRect(px1, py1, boxWidth, boxHeight);

      if (tracksStore.showLabels) {
        const label = `#${item.trackId} ${item.clsName} ${(item.conf * 100).toFixed(0)}%`;
        ctx.font = '12px "Inter", system-ui';
        ctx.textBaseline = 'top';
        const padding = 4;
        const metrics = ctx.measureText(label);
        const textWidth = metrics.width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        const rectWidth = textWidth + padding * 2;
        const rectHeight = 16;
        ctx.fillRect(px1, py1 - rectHeight, rectWidth, rectHeight);
        ctx.fillStyle = color;
        ctx.fillText(label, px1 + padding, py1 - rectHeight + 2);
      }
    });
  }
};

onMounted(() => {
  frameHandle = requestAnimationFrame(drawFrame);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frameHandle);
});

watch(
  () => props.videoEl,
  () => {
    if (!props.videoEl) {
      const canvas = canvasRef.value;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }
);
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
