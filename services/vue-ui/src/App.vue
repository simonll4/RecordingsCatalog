<script setup lang="ts">
// Layout principal de la app: header con marca y slot para las rutas
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">Media Tracker</RouterLink>
      <nav class="app-nav">
      <RouterLink to="/" class="app-nav__link" exact-active-class="app-nav__link--active">
        Grabaciones
      </RouterLink>
      <RouterLink to="/control" class="app-nav__link" active-class="app-nav__link--active">
        En vivo & Control
      </RouterLink>
    </nav>
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
  gap: 1.5rem;
}

.brand {
  font-size: 1.2rem;
  font-weight: 600;
  color: inherit;
  text-decoration: none;
}

.app-nav {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.app-nav__link {
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  font-weight: 500;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  transition: color 0.2s ease, background 0.2s ease;
}

.app-nav__link:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.app-nav__link--active {
  color: #fff;
  background: rgba(99, 102, 241, 0.18);
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

  .app-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
}
</style>
