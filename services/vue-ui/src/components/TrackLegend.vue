<script setup lang="ts">
import { computed } from 'vue'
import type { TrackMeta } from '../types/tracks'
import { useTracksStore } from '../stores/useTracks'

/**
 * Panel de control para las anotaciones:
 * - Toggle para mostrar/ocultar cajas, etiquetas y trayectorias.
 * - Slider para confianza mínima.
 * - Lista de clases detectadas para filtrar por clase.
 */
const props = defineProps<{
  meta: TrackMeta | null
  metaMissing?: boolean
  indexMissing?: boolean
  disabled?: boolean
}>()

const tracksStore = useTracksStore()

const classFilters = computed(() => props.meta?.classes ?? [])
const isDisabled = computed(() => props.disabled ?? false)

const disabledMessage = computed(() => {
  if (!isDisabled.value) return ''
  if (props.indexMissing) {
    return 'No se encontró index.json; no hay segmentos de tracking disponibles.'
  }
  if (props.metaMissing) {
    return 'No se encontró meta.json; no es posible mostrar anotaciones.'
  }
  return 'Las anotaciones no están disponibles para esta sesión.'
})
</script>

<template>
  <section class="legend">
    <header>
      <h2>Anotaciones</h2>
      <p v-if="!isDisabled">Activá o filtrá lo que se superpone sobre el video.</p>
      <p v-else class="hint">{{ disabledMessage }}</p>
    </header>

    <div class="toggles" :class="{ disabled: isDisabled }">
      <label>
        <input
          type="checkbox"
          :checked="tracksStore.showBoxes"
          :disabled="isDisabled"
          @change="tracksStore.showBoxes = !tracksStore.showBoxes"
        />
        Cajas
      </label>
      <label>
        <input
          type="checkbox"
          :checked="tracksStore.showLabels"
          :disabled="isDisabled"
          @change="tracksStore.showLabels = !tracksStore.showLabels"
        />
        Etiquetas
      </label>
      <label>
        <input
          type="checkbox"
          :checked="tracksStore.showTrails"
          :disabled="isDisabled"
          @change="tracksStore.showTrails = !tracksStore.showTrails"
        />
        Trayectorias (2 s)
      </label>
    </div>

    <div class="slider">
      <label for="conf-slider"
        >Confianza mínima: {{ Math.round(tracksStore.confMin * 100) }}%</label
      >
      <input
        id="conf-slider"
        type="range"
        min="0"
        max="1"
        step="0.05"
        :value="tracksStore.confMin"
        :disabled="isDisabled"
        @input="tracksStore.confMin = Number(($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="classes">
      <h3>Clases detectadas</h3>
      <p v-if="classFilters.length === 0" class="hint">
        {{
          isDisabled
            ? 'No hay anotaciones disponibles.'
            : 'Aún no hay clases registradas para esta sesión.'
        }}
      </p>
      <ul v-else>
        <li v-for="cls in classFilters" :key="cls.id">
          <label>
            <input
              type="checkbox"
              :checked="tracksStore.selectedClasses.has(cls.id)"
              :disabled="isDisabled"
              @change="tracksStore.toggleClass(cls.id)"
            />
            {{ cls.name }}
          </label>
        </li>
      </ul>
    </div>

  </section>
</template>

<style scoped>
.legend {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 0.75rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

header h2 {
  margin: 0;
  font-size: 1.1rem;
}

header p {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.6);
}

.toggles {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
}

input[type='checkbox'] {
  accent-color: #74c0fc;
}

.toggles.disabled label,
.toggles.disabled input,
.classes input:disabled,
input[disabled] {
  opacity: 0.5;
  cursor: not-allowed;
}

.slider {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

input[type='range'] {
  width: 100%;
}

.classes {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.classes ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.4rem;
}

.color-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.hint {
  color: rgba(255, 255, 255, 0.55);
  margin: 0;
  font-size: 0.85rem;
}
</style>
