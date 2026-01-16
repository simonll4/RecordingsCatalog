import './assets/main.css'

// Punto de entrada: crea la app Vue, registra Pinia y el Router y monta en #app.
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)

app.mount('#app')
