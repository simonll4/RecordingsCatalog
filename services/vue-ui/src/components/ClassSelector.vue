<template>
  <div class="class-selector">
    <div class="class-selector__chips">
      <button
        v-for="cls in availableClasses"
        :key="cls.name"
        :class="[
          'class-chip',
          { 'class-chip--selected': isSelected(cls.name) }
        ]"
        @click="toggleClass(cls.name)"
        :disabled="disabled"
      >
        <span class="class-chip__name">{{ cls.name }}</span>
      </button>
    </div>

    <div class="class-selector__actions">
      <button
        class="btn-chip btn-chip--small"
        @click="selectAll"
        :disabled="disabled || allSelected"
      >
        Todas
      </button>
      <button
        class="btn-chip btn-chip--small"
        @click="selectNone"
        :disabled="disabled || noneSelected"
      >
        Ninguna
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ClassInfo {
  name: string
}

interface Props {
  catalog: string[]
  modelValue: string[]
  disabled?: boolean
}

interface Emits {
  (e: 'update:modelValue', value: string[]): void
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false
})

const emit = defineEmits<Emits>()

const availableClasses = computed<ClassInfo[]>(() => {
  return props.catalog.map(name => ({
    name
  }))
})

const selectedSet = computed(() => new Set(props.modelValue))

const allSelected = computed(() => props.modelValue.length === props.catalog.length)
const noneSelected = computed(() => props.modelValue.length === 0)

function isSelected(className: string): boolean {
  return selectedSet.value.has(className)
}

function toggleClass(className: string) {
  const newSelection = new Set(props.modelValue)
  
  if (newSelection.has(className)) {
    newSelection.delete(className)
  } else {
    newSelection.add(className)
  }
  
  emit('update:modelValue', Array.from(newSelection))
}

function selectAll() {
  emit('update:modelValue', [...props.catalog])
}

function selectNone() {
  emit('update:modelValue', [])
}
</script>

<style scoped>
.class-selector {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.class-selector__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.class-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem;
  border: 2px solid var(--color-border);
  border-radius: 1.5rem;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.class-chip:hover:not(:disabled) {
  border-color: var(--color-primary);
  background: var(--color-bg-hover);
  transform: translateY(-1px);
}

.class-chip:active:not(:disabled) {
  transform: translateY(0);
}

.class-chip--selected {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: white;
}

.class-chip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.class-chip__name {
  text-transform: capitalize;
}

.class-selector__actions {
  display: flex;
  gap: 0.5rem;
}

.btn-chip {
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--color-border);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-chip:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-bg-hover);
}

.btn-chip--small {
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
}

.btn-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
