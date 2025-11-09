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
  { value: 'rojo', label: 'Rojo' },
  { value: 'azul', label: 'Azul' },
  { value: 'verde', label: 'Verde' },
  { value: 'amarillo', label: 'Amarillo' },
  { value: 'naranja', label: 'Naranja' },
  { value: 'morado', label: 'Morado' },
  { value: 'rosa', label: 'Rosa' }, 
  { value: 'marrón', label: 'Marrón' },
  { value: 'blanco', label: 'Blanco' },
  { value: 'negro', label: 'Negro' },
  { value: 'gris', label: 'Gris' },
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
    <button 
      v-if="selectedColor"
      type="button" 
      class="clear-btn clear-btn--floating" 
      @click="clearSelection"
      :disabled="isDisabled"
    >
      Limpiar selección
    </button>
    
    <div class="color-chips" :class="{ disabled: isDisabled }">
      <button
        v-for="color in colorOptions"
        :key="color.value"
        type="button"
        class="color-chip"
        :class="[{ active: selectedColor === color.value }, `color-${color.value}`]"
        :disabled="isDisabled"
        @click="selectColor(color.value)"
        :title="`Filtrar por ${color.label.toLowerCase()}`"
      >
        <span class="chip-label">{{ color.label }}</span>
      </button>
    </div>
    
    <div v-if="selectedColor" class="selection-info">
      <span>
        Buscando sesiones con objetos de color <strong>{{ selectedColor }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.color-filter {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-top: 0.25rem;
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

.clear-btn--floating {
  position: absolute;
  top: -2.25rem;
  right: 0;
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
  align-items: center;
  justify-content: center;
  padding: 0.7rem 0.6rem;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.6rem;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  min-height: 42px;
}

.color-chip:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* Estilos activos para cada color */
.color-chip.color-rojo.active {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15), 0 0 12px rgba(239, 68, 68, 0.4);
  transform: scale(1.05);
}

.color-chip.color-rojo.active .chip-label {
  color: #fca5a5;
  font-weight: 700;
}

.color-chip.color-azul.active {
  background: rgba(59, 130, 246, 0.25);
  border-color: #3b82f6;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15), 0 0 12px rgba(59, 130, 246, 0.4);
  transform: scale(1.05);
}

.color-chip.color-azul.active .chip-label {
  color: #93c5fd;
  font-weight: 700;
}

.color-chip.color-verde.active {
  background: rgba(34, 197, 94, 0.25);
  border-color: #22c55e;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15), 0 0 12px rgba(34, 197, 94, 0.4);
  transform: scale(1.05);
}

.color-chip.color-verde.active .chip-label {
  color: #86efac;
  font-weight: 700;
}

.color-chip.color-amarillo.active {
  background: rgba(234, 179, 8, 0.25);
  border-color: #eab308;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(234, 179, 8, 0.15), 0 0 12px rgba(234, 179, 8, 0.4);
  transform: scale(1.05);
}

.color-chip.color-amarillo.active .chip-label {
  color: #fde047;
  font-weight: 700;
}

.color-chip.color-naranja.active {
  background: rgba(249, 115, 22, 0.25);
  border-color: #f97316;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(249, 115, 22, 0.15), 0 0 12px rgba(249, 115, 22, 0.4);
  transform: scale(1.05);
}

.color-chip.color-naranja.active .chip-label {
  color: #fdba74;
  font-weight: 700;
}

.color-chip.color-morado.active {
  background: rgba(168, 85, 247, 0.25);
  border-color: #a855f7;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.15), 0 0 12px rgba(168, 85, 247, 0.4);
  transform: scale(1.05);
}

.color-chip.color-morado.active .chip-label {
  color: #d8b4fe;
  font-weight: 700;
}

.color-chip.color-rosa.active {
  background: rgba(236, 72, 153, 0.25);
  border-color: #ec4899;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.15), 0 0 12px rgba(236, 72, 153, 0.4);
  transform: scale(1.05);
}

.color-chip.color-rosa.active .chip-label {
  color: #f9a8d4;
  font-weight: 700;
}

.color-chip.color-marrón.active {
  background: rgba(161, 98, 7, 0.25);
  border-color: #a16207;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(161, 98, 7, 0.15), 0 0 12px rgba(161, 98, 7, 0.4);
  transform: scale(1.05);
}

.color-chip.color-marrón.active .chip-label {
  color: #fbbf24;
  font-weight: 700;
}

.color-chip.color-blanco.active {
  background: rgba(255, 255, 255, 0.25);
  border-color: #ffffff;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.15), 0 0 12px rgba(255, 255, 255, 0.4);
  transform: scale(1.05);
}

.color-chip.color-blanco.active .chip-label {
  color: #ffffff;
  font-weight: 700;
}

.color-chip.color-negro.active {
  background: rgba(30, 30, 30, 0.5);
  border-color: #3f3f46;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(30, 30, 30, 0.3), 0 0 12px rgba(30, 30, 30, 0.5);
  transform: scale(1.05);
}

.color-chip.color-negro.active .chip-label {
  color: #e4e4e7;
  font-weight: 700;
}

.color-chip.color-gris.active {
  background: rgba(107, 114, 128, 0.25);
  border-color: #6b7280;
  border-width: 2.5px;
  box-shadow: 0 0 0 3px rgba(107, 114, 128, 0.15), 0 0 12px rgba(107, 114, 128, 0.4);
  transform: scale(1.05);
}

.color-chip.color-gris.active .chip-label {
  color: #d1d5db;
  font-weight: 700;
}

.color-chip:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.chip-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
  text-align: center;
  font-weight: 500;
  line-height: 1.2;
}

.selection-info {
  display: flex;
  align-items: center;
  padding: 0.65rem 0.9rem;
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(34, 197, 94, 0.08) 100%);
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-left: 3px solid rgba(34, 197, 94, 0.6);
  border-radius: 0.5rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.4;
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
    padding: 0.6rem 0.4rem;
  }

  .chip-label {
    font-size: 0.75rem;
  }
}

@media (max-width: 480px) {
  .color-chips {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
