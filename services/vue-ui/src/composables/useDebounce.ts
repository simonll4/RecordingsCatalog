/**
 * Debounce Composable
 * Provides debounced values and functions
 */

import { ref, watch, type Ref, type UnwrapRef } from 'vue'

/**
 * Create a debounced ref
 */
export function useDebouncedRef<T>(
  initialValue: T,
  delay: number = 300
): {
  value: Ref<T>
  debouncedValue: Ref<T>
  pending: Ref<boolean>
} {
  const value = ref<T>(initialValue) as Ref<T>
  const debouncedValue = ref<T>(initialValue) as Ref<T>
  const pending = ref(false)
  
  let timeout: ReturnType<typeof setTimeout> | undefined

  watch(value, (newValue) => {
    pending.value = true
    if (timeout) {
      clearTimeout(timeout)
    }
    
    timeout = setTimeout(() => {
      debouncedValue.value = newValue as T
      pending.value = false
    }, delay)
  })

  return {
    value,
    debouncedValue,
    pending,
  }
}

/**
 * Create a debounced function
 */
export function useDebouncedFn<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300
): {
  debouncedFn: T
  cancel: () => void
  pending: Ref<boolean>
} {
  const pending = ref(false)
  let timeout: ReturnType<typeof setTimeout> | undefined

  const cancel = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = undefined
      pending.value = false
    }
  }

  const debouncedFn = ((...args: Parameters<T>) => {
    cancel()
    pending.value = true
    
    return new Promise<ReturnType<T>>((resolve) => {
      timeout = setTimeout(() => {
        pending.value = false
        resolve(fn(...args))
      }, delay)
    })
  }) as T

  return {
    debouncedFn,
    cancel,
    pending,
  }
}
