<script setup lang="ts">
import { ref } from 'vue'
import ClassFilter from './ClassFilter.vue'
import ColorFilter from './ColorFilter.vue'

/**
 * Componente de búsqueda de sesiones por rango temporal, clases detectadas y color.
 * Emite `search` con payload { from: ISOString, to: ISOString, classes?: string[], color?: string }.
 * - Tiene botones de rango rápido (15m, 1h, 3h, 6h)
 * - Permite seleccionar manualmente Desde/Hasta con `datetime-local`
 * - Filtro de clases detectadas (multi-select)
 * - Filtro de color detectado (single-select)
 * - Botón "Todas las sesiones" para traer sin filtros
 */

// Catálogo de clases disponibles (las 5 clases del modelo)
const AVAILABLE_CLASSES = ['backpack', 'bottle', 'cup', 'person', 'shoes']

const emit = defineEmits<{
  (e: 'search', payload: { from: string; to: string; classes?: string[]; color?: string }): void
  (e: 'search-all'): void
}>()

// Formatea una Date para `input[type=datetime-local]` (no incluye segundos)
const formatInputValue = (date: Date) => {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}`
}

// Valores iniciales: rango por defecto 1 hora atrás hasta ahora
const now = new Date()
const fromInput = ref(formatInputValue(new Date(now.getTime() - 60 * 60 * 1000)))
const toInput = ref(formatInputValue(now))
const selectedClasses = ref<string[]>([])
const selectedColor = ref<string | null>(null)
const activeTimeButton = ref<string | null>(null) // Rastrear botón activo (ninguno por defecto)

/**
 * Emite el rango solicitado en formato ISO y actualiza los inputs locales.
 */
const emitRange = (from: Date, to: Date, classes?: string[], color?: string | null) => {
  emit('search', { 
    from: from.toISOString(), 
    to: to.toISOString(),
    classes: classes && classes.length > 0 ? classes : undefined,
    color: color || undefined
  })
  fromInput.value = formatInputValue(from)
  toInput.value = formatInputValue(to)
}

/**
 * Aplica un rango rápido (en minutos). No bloqueante.
 */
const applyQuickRange = (minutes: number, buttonId: string) => {
  const to = new Date()
  const from = new Date(to.getTime() - minutes * 60 * 1000)
  activeTimeButton.value = buttonId
  emitRange(from, to, selectedClasses.value, selectedColor.value)
}

/**
 * Handler de submit del formulario.
 * Valida que las fechas sean válidas y `from < to` antes de emitir.
 */
const submit = () => {
  const from = new Date(fromInput.value)
  const to = new Date(toInput.value)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    return
  }
  activeTimeButton.value = 'custom'
  emitRange(from, to, selectedClasses.value, selectedColor.value)
}

/**
 * Handler cuando cambia la selección de clases
 */
const handleClassFilterChange = (classes: string[]) => {
  selectedClasses.value = classes
  
  // Auto-buscar cuando cambian las clases (usando el rango actual)
  const from = new Date(fromInput.value)
  const to = new Date(toInput.value)
  if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) {
    emitRange(from, to, classes, selectedColor.value)
  }
}

/**
 * Handler cuando cambia la selección de color
 */
const handleColorFilterChange = (color: string | null) => {
  selectedColor.value = color
  
  // Auto-buscar cuando cambia el color (usando el rango actual)
  const from = new Date(fromInput.value)
  const to = new Date(toInput.value)
  if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from < to) {
    emitRange(from, to, selectedClasses.value, color)
  }
}
</script>

<template>
  <div class="search-container">
    <!-- Rango Temporal Compacto -->
    <div class="time-filters">
      <div class="quick-buttons">
        <button type="button" class="time-btn" :class="{ active: activeTimeButton === '15m' }" @click="applyQuickRange(15, '15m')">15m</button>
        <button type="button" class="time-btn" :class="{ active: activeTimeButton === '1h' }" @click="applyQuickRange(60, '1h')">1h</button>
        <button type="button" class="time-btn" :class="{ active: activeTimeButton === '3h' }" @click="applyQuickRange(180, '3h')">3h</button>
        <button type="button" class="time-btn" :class="{ active: activeTimeButton === '6h' }" @click="applyQuickRange(360, '6h')">6h</button>
        <button type="button" class="time-btn all-btn" :class="{ active: activeTimeButton === 'all' }" @click="activeTimeButton = 'all'; emit('search-all')">Todas</button>
      </div>
      
      <form class="custom-time" @submit.prevent="submit">
        <div class="time-inputs">
          <input v-model="fromInput" type="datetime-local" placeholder="Desde" />
          <span class="separator">→</span>
          <input v-model="toInput" type="datetime-local" placeholder="Hasta" />
        </div>
        <button type="submit" class="btn-search">Buscar</button>
      </form>
    </div>
    
    <!-- Filtros en Grid Compacto -->
    <div class="filters-grid">
      <!-- Filtro de Clases -->
      <div class="filter-card">
        <div class="filter-header">
          <h3>Tipo de objeto</h3>
        </div>
        <ClassFilter 
          :available-classes="AVAILABLE_CLASSES"
          @change="handleClassFilterChange"
        />
      </div>
      
      <!-- Filtro de Color -->
      <div class="filter-card">
        <div class="filter-header">
          <h3>Color del objeto</h3>
        </div>
        <ColorFilter 
          @change="handleColorFilterChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* === Rango Temporal === */
.time-filters {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.quick-buttons {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.time-btn {
  flex: 1;
  min-width: 50px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
  padding: 0.45rem 0.75rem;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.time-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
}

.time-btn.active {
  background: rgba(77, 171, 247, 0.25);
  border-color: rgba(77, 171, 247, 0.5);
  color: #74c0fc;
  font-weight: 600;
  box-shadow: 0 0 8px rgba(77, 171, 247, 0.3);
}

.all-btn {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.85);
  font-weight: 500;
}

.all-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
}

.all-btn.active {
  background: rgba(77, 171, 247, 0.35);
  border-color: rgba(77, 171, 247, 0.7);
  color: #74c0fc;
  font-weight: 600;
  box-shadow: 0 0 12px rgba(77, 171, 247, 0.5);
}

.custom-time {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.time-inputs {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.4rem;
  padding: 0.4rem 0.6rem;
}

.time-inputs input {
  flex: 1;
  background: transparent;
  border: none;
  color: inherit;
  font-size: 0.8rem;
  padding: 0;
}

.time-inputs input:focus {
  outline: none;
}

.separator {
  color: rgba(255, 255, 255, 0.4);
  font-weight: bold;
  padding: 0 0.25rem;
}

.btn-search {
  background: rgba(77, 171, 247, 0.25);
  border: 1px solid rgba(77, 171, 247, 0.5);
  color: #74c0fc;
  padding: 0.5rem 1rem;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.btn-search:hover {
  background: rgba(77, 171, 247, 0.35);
  border-color: rgba(77, 171, 247, 0.7);
}

/* === Grid de Filtros === */
.filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
}

.filter-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}

.filter-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

/* === Responsive === */
@media (max-width: 768px) {
  .filters-grid {
    grid-template-columns: 1fr;
  }

  .custom-time {
    flex-direction: column;
  }

  .btn-search {
    width: 100%;
  }

  .quick-buttons {
    gap: 0.3rem;
  }

  .time-btn {
    font-size: 0.8rem;
    padding: 0.4rem 0.6rem;
  }
}

@media (max-width: 480px) {
  .quick-buttons {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }

  .all-btn {
    grid-column: 1 / -1;
  }

  .time-inputs {
    flex-direction: column;
    align-items: stretch;
  }

  .separator {
    display: none;
  }
}
</style>
