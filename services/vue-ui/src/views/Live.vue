<script setup lang="ts">
import WebRtcPlayer from '@/components/live/WebRtcPlayer.vue'
</script>

<template>
  <section class="live-view">
    <WebRtcPlayer />
  </section>
</template>

<style scoped>
.live-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>
