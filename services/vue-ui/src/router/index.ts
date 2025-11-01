import { createRouter, createWebHistory } from 'vue-router'

/**
 * Router de la aplicación:
 * - Ruta `/` -> `Home.vue`
 * - Ruta `/session/:sessionId` (alias `/:sessionId`) -> `Session.vue`
 */
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/Home.vue'),
    },
    {
      path: '/session/:sessionId',
      alias: '/:sessionId',
      name: 'session',
      component: () => import('../views/Session.vue'),
      props: true,
    },
    {
      path: '/live',
      name: 'live',
      component: () => import('../views/Live.vue'),
    },
    {
      path: '/control',
      name: 'control',
      component: () => import('../views/Control.vue'),
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

export default router
