import { ref } from 'vue'

/**
 * Shared WebRTC connection state
 * Used to coordinate UI feedback across components
 */
const isWebRtcConnected = ref(false)
const isWebRtcLoading = ref(false)

export function useWebRtcState() {
  const setConnected = (connected: boolean) => {
    isWebRtcConnected.value = connected
  }

  const setLoading = (loading: boolean) => {
    isWebRtcLoading.value = loading
  }

  return {
    isWebRtcConnected,
    isWebRtcLoading,
    setConnected,
    setLoading,
  }
}
