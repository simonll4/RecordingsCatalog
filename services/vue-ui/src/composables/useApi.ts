/**
 * API Composable
 * Provides reactive API state management
 */

import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import { HttpError } from '@/api'

/**
 * API State interface
 */
export interface ApiState<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

/**
 * API Options
 */
export interface ApiOptions {
  immediate?: boolean
  onSuccess?: (data: any) => void
  onError?: (error: Error) => void
}

/**
 * Create an API composable for managing async operations
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  options: ApiOptions = {}
): {
  data: ShallowRef<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  execute: () => Promise<T | null>
  reset: () => void
} {
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)

  const execute = async (): Promise<T | null> => {
    loading.value = true
    error.value = null

    try {
      const result = await fetcher()
      data.value = result
      options.onSuccess?.(result)
      return result
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error(String(err))
      error.value = errorObj
      options.onError?.(errorObj)
      
      // Log specific HTTP errors
      if (err instanceof HttpError) {
        console.error(`HTTP Error ${err.status}:`, err.body)
      }
      
      return null
    } finally {
      loading.value = false
    }
  }

  const reset = () => {
    data.value = null
    loading.value = false
    error.value = null
  }

  // Execute immediately if requested
  if (options.immediate) {
    execute()
  }

  return {
    data,
    loading,
    error,
    execute,
    reset,
  }
}
