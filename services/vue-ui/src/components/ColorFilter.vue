<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * Filtro de colores para detecciones enriquecidas.
 * Permite filtrar detecciones por color dominante.
 */

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'change', color: string | null): void
}>()

const selectedColor = ref<string | null>(null)

// Colores comunes detectados por el attribute-enricher
const colorOptions = [
  { value: 'rojo', label: 'Rojo', emoji: '🔴' },
  { value: 'azul', label: 'Azul', emoji: '🔵' },
  { value: 'verde', label: 'Verde', emoji: '🟢' },
  { value: 'amarillo', label: 'Amarillo', emoji: '🟡' },
  { value: 'naranja', label: 'Naranja', emoji: '🟠' },
  { value: 'morado', label: 'Morado', emoji: '🟣' },
  { value: 'rosa', label: 'Rosa', emoji: '🌸' },
  { value: 'marrón', label: 'Marrón', emoji: '🟤' },
  { value: 'blanco', label: 'Blanco', emoji: '⚪' },
  { value: 'negro', label: 'Negro', emoji: '⚫' },
  { value: 'gris', label: 'Gris', emoji: '⚫' },
]

const selectColor = (color: string) => {
  if (selectedColor.value === color) {
    // Deseleccionar si ya está seleccionado
    selectedColor.value = null
    emit('change', null)
  } else {
    selectedColor.value = color
    emit('change', color)
  }
}

const clearSelection = () => {
  selectedColor.value = null
  emit('change', null)
}

const isDisabled = computed(() => props.disabled ?? false)
</script>

<template>
  <div class="color-filter">
    <div v-if="selectedColor" class="filter-header">
      <button 
        type="button" 
        class="clear-btn" 
        @click="clearSelection"
        :disabled="isDisabled"
      >
        ✕ Limpiar selección
      </button>
    </div>
    
    <div class="color-chips" :class="{ disabled: isDisabled }">
      <button
        v-for="color in colorOptions"
        :key="color.value"
        type="button"
        class="color-chip"
        :class="{ active: selectedColor === color.value }"
        :disabled="isDisabled"
        @click="selectColor(color.value)"
        :title="`Filtrar por ${color.label.toLowerCase()}`"
      >
        <span class="chip-emoji">{{ color.emoji }}</span>
        <span class="chip-label">{{ color.label }}</span>
      </button>
    </div>
    
    <div v-if="selectedColor" class="selection-info">
      <span class="info-icon">✓</span>
      <span>
        Buscando sesiones con objetos de color <strong>{{ selectedColor }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.color-filter {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.filter-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
}

.clear-btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 500;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.4rem;
  color: #f87171;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fca5a5;
  transform: translateY(-1px);
}

.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.color-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(85px, 1fr));
  gap: 0.6rem;
}

.color-chips.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.color-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.65rem 0.4rem;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.6rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.color-chip:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.color-chip.active {
  background: rgba(116, 192, 252, 0.2);
  border-color: #4dabf7;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(77, 171, 247, 0.15);
}

.color-chip.active::after {
  content: '✓';
  position: absolute;
  top: -6px;
  right: -6px;
  background: #4dabf7;
  color: white;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(77, 171, 247, 0.4);
}

.color-chip:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.chip-emoji {
  font-size: 1.75rem;
  line-height: 1;
}

.chip-label {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.75);
  text-align: center;
  font-weight: 500;
  line-height: 1.2;
}

.color-chip.active .chip-label {
  color: #74c0fc;
  font-weight: 700;
}

.selection-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.65rem 0.9rem;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.08) 100%);
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 0.5rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
}

.info-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
  color: #22c55e;
  font-weight: bold;
  background: rgba(34, 197, 94, 0.2);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

strong {
  color: #4ade80;
  font-weight: 700;
  text-transform: lowercase;
}

/* Responsive */
@media (max-width: 768px) {
  .color-chips {
    grid-template-columns: repeat(auto-fill, minmax(75px, 1fr));
    gap: 0.5rem;
  }

  .color-chip {
    padding: 0.5rem 0.3rem;
  }

  .chip-emoji {
    font-size: 1.5rem;
  }

  .chip-label {
    font-size: 0.7rem;
  }
}

@media (max-width: 480px) {
  .color-chips {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
