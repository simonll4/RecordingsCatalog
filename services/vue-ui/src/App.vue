<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">Media Tracker</RouterLink>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0f1115;
  color: #f1f3f5;
}

.app-header {
  display: flex;
  align-items: center;
  padding: 1rem 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(12, 14, 18, 0.85);
  backdrop-filter: blur(10px);
}

.brand {
  font-size: 1.2rem;
  font-weight: 600;
  color: inherit;
  text-decoration: none;
}

.app-main {
  flex: 1;
  padding: 1.5rem 2rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

@media (max-width: 768px) {
  .app-main {
    padding: 1rem;
  }
}
</style>
