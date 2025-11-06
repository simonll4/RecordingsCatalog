<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Filtro de clases detectadas.
 * Permite seleccionar múltiples clases para filtrar sesiones.
 */

const props = defineProps<{
  availableClasses: string[]
}>()

const emit = defineEmits<{
  (e: 'change', selected: string[]): void
}>()

const selectedClasses = ref<Set<string>>(new Set())

const toggleClass = (className: string) => {
  if (selectedClasses.value.has(className)) {
    selectedClasses.value.delete(className)
  } else {
    selectedClasses.value.add(className)
  }
  emit('change', Array.from(selectedClasses.value))
}

const clearAll = () => {
  selectedClasses.value.clear()
  emit('change', [])
}

const selectAll = () => {
  selectedClasses.value = new Set(props.availableClasses)
  emit('change', Array.from(selectedClasses.value))
}

const hasSelection = computed(() => selectedClasses.value.size > 0)
const allSelected = computed(() => selectedClasses.value.size === props.availableClasses.length)

// Mapeo de clases a emojis/iconos para mejor UX
const classIcons: Record<string, string> = {
  'person': '👤',
  'backpack': '🎒',
  'bottle': '🍾',
  'cup': '☕',
  'shoes': '👟'
}
</script>

<template>
  <div class="class-filter">
    <div class="filter-header">
      <span class="filter-label">Filtrar por clases:</span>
      <div class="filter-actions">
        <button 
          type="button" 
          class="action-btn" 
          @click="selectAll"
          :disabled="allSelected"
        >
          Todas
        </button>
        <button 
          type="button" 
          class="action-btn" 
          @click="clearAll"
          :disabled="!hasSelection"
        >
          Ninguna
        </button>
      </div>
    </div>
    
    <div class="class-chips">
      <button
        v-for="className in availableClasses"
        :key="className"
        type="button"
        class="class-chip"
        :class="{ active: selectedClasses.has(className) }"
        @click="toggleClass(className)"
      >
        <span class="chip-icon">{{ classIcons[className] || '📦' }}</span>
        <span class="chip-label">{{ className }}</span>
      </button>
    </div>
    
    <div v-if="hasSelection" class="selection-summary">
      <span v-if="selectedClasses.size === 1">
        Mostrando sesiones con: <strong>{{ Array.from(selectedClasses)[0] }}</strong>
      </span>
      <span v-else>
        Mostrando sesiones que tengan <strong>todas</strong> estas clases: <strong>{{ Array.from(selectedClasses).join(' + ') }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.class-filter {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  padding: 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.filter-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
  font-weight: 500;
}

.filter-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.4rem;
  padding: 0.25rem 0.6rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.class-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.class-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 1.5rem;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  font-size: 0.9rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

.class-chip:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.class-chip.active {
  background: rgba(77, 171, 247, 0.2);
  border-color: rgba(77, 171, 247, 0.6);
  color: #4dabf7;
}

.class-chip.active:hover {
  background: rgba(77, 171, 247, 0.3);
  border-color: rgba(77, 171, 247, 0.8);
}

.chip-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.chip-label {
  text-transform: capitalize;
}

.selection-summary {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  padding: 0.5rem;
  background: rgba(77, 171, 247, 0.1);
  border-radius: 0.5rem;
  border-left: 3px solid rgba(77, 171, 247, 0.5);
}

.selection-summary strong {
  color: #4dabf7;
  font-weight: 600;
}

@media (max-width: 640px) {
  .filter-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .class-chips {
    justify-content: center;
  }
}
</style>
