<script setup lang="ts">
import { ref } from 'vue'

/**
 * Componente de búsqueda de sesiones por rango temporal.
 * Emite `search` con payload { from: ISOString, to: ISOString }.
 * - Tiene botones de rango rápido (15m, 1h, 3h, 6h)
 * - Permite seleccionar manualmente Desde/Hasta con `datetime-local`
 */
const emit = defineEmits<{
  (e: 'search', payload: { from: string; to: string }): void
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

/**
 * Emite el rango solicitado en formato ISO y actualiza los inputs locales.
 */
const emitRange = (from: Date, to: Date) => {
  emit('search', { from: from.toISOString(), to: to.toISOString() })
  fromInput.value = formatInputValue(from)
  toInput.value = formatInputValue(to)
}

/**
 * Aplica un rango rápido (en minutos). No bloqueante.
 */
const applyQuickRange = (minutes: number) => {
  const to = new Date()
  const from = new Date(to.getTime() - minutes * 60 * 1000)
  emitRange(from, to)
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
  emitRange(from, to)
}
</script>

<template>
  <div class="search">
    <div class="quick">
      <button type="button" @click="applyQuickRange(15)">15 min</button>
      <button type="button" @click="applyQuickRange(60)">1 h</button>
      <button type="button" @click="applyQuickRange(180)">3 h</button>
      <button type="button" @click="applyQuickRange(360)">6 h</button>
    </div>
    <form class="custom" @submit.prevent="submit">
      <label>
        Desde
        <input v-model="fromInput" type="datetime-local" />
      </label>
      <label>
        Hasta
        <input v-model="toInput" type="datetime-local" />
      </label>
      <button type="submit">Buscar</button>
    </form>
  </div>
</template>

<style scoped>
.search {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: rgba(255, 255, 255, 0.04);
  padding: 0.75rem;
  border-radius: 0.75rem;
}

.quick {
  display: flex;
  gap: 0.5rem;
}

button {
  background: rgba(255, 255, 255, 0.1);
  color: inherit;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: background 0.2s ease-in-out;
}

button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.custom {
  display: grid;
  grid-template-columns: repeat(3, auto);
  gap: 0.75rem;
  align-items: end;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
}

input {
  background: rgba(12, 14, 18, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.4rem 0.6rem;
  color: inherit;
}

@media (max-width: 640px) {
  .custom {
    grid-template-columns: 1fr;
  }
}
</style>
