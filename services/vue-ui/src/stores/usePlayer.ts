import { ref, watch } from 'vue';
import { defineStore } from 'pinia';

export const usePlayerStore = defineStore('player', () => {
  const videoEl = ref<HTMLVideoElement | null>(null);
  const playbackUrl = ref<string | null>(null);
  const sessionId = ref<string | null>(null);
  const currentTime = ref(0);
  const duration = ref(0);
  const isPlaying = ref(false);
  const isSeeking = ref(false);

  const detachListeners = (el: HTMLVideoElement | null) => {
    if (!el) return;
    el.removeEventListener('timeupdate', handleTimeUpdate);
    el.removeEventListener('durationchange', handleDurationChange);
    el.removeEventListener('play', handlePlayState);
    el.removeEventListener('pause', handlePlayState);
    el.removeEventListener('seeking', handleSeeking);
    el.removeEventListener('seeked', handleSeeked);
  };

  const attachListeners = (el: HTMLVideoElement | null) => {
    if (!el) return;
    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('durationchange', handleDurationChange);
    el.addEventListener('play', handlePlayState);
    el.addEventListener('pause', handlePlayState);
    el.addEventListener('seeking', handleSeeking);
    el.addEventListener('seeked', handleSeeked);
  };

  const handleTimeUpdate = () => {
    if (!isSeeking.value) {
      currentTime.value = videoEl.value?.currentTime ?? 0;
    }
  };

  const handleDurationChange = () => {
    duration.value = videoEl.value?.duration ?? 0;
  };

  const handlePlayState = () => {
    isPlaying.value = !videoEl.value?.paused;
  };

  const handleSeeking = () => {
    isSeeking.value = true;
  };

  const handleSeeked = () => {
    isSeeking.value = false;
    currentTime.value = videoEl.value?.currentTime ?? 0;
  };

  const attachVideo = (el: HTMLVideoElement | null) => {
    if (videoEl.value === el) {
      return;
    }
    detachListeners(videoEl.value);
    videoEl.value = el;
    attachListeners(el);
    if (el && playbackUrl.value) {
      el.src = playbackUrl.value;
    }
  };

  const setPlaybackSource = (url: string | null) => {
    playbackUrl.value = url;
    if (videoEl.value) {
      if (url) {
        videoEl.value.src = url;
        void videoEl.value.load();
        currentTime.value = 0;
      } else {
        videoEl.value.removeAttribute('src');
        videoEl.value.load();
      }
    }
  };

  const setSession = (id: string | null) => {
    sessionId.value = id;
    currentTime.value = 0;
  };

  const play = async () => {
    if (!videoEl.value) return;
    try {
      await videoEl.value.play();
    } catch (error) {
      console.warn('Failed to start playback', error);
    }
  };

  const pause = () => {
    videoEl.value?.pause();
  };

  const seek = (time: number) => {
    if (!videoEl.value) return;
    videoEl.value.currentTime = Math.max(0, time);
    currentTime.value = time;
  };

  watch(playbackUrl, (url) => {
    if (!url && videoEl.value) {
      videoEl.value.removeAttribute('src');
      videoEl.value.load();
    }
  });

  return {
    videoEl,
    playbackUrl,
    sessionId,
    currentTime,
    duration,
    isPlaying,
    attachVideo,
    setPlaybackSource,
    setSession,
    play,
    pause,
    seek
  };
});
