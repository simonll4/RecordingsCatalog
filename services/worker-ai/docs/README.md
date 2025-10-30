# Documentación Worker AI

## 📚 Índice de Documentación

### Arquitectura y Diseño

  - Objetivos y cambios implementados
  - Estructura de módulos creados
  - Métricas de mejora (531 → 48 líneas en worker_new.py)
  - Beneficios logrados

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Arquitectura del sistema
  - Flujo de procesamiento de frames
  - Separación de responsabilidades por capas
  - Diagramas de componentes

### Implementación

- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** - Detalles de implementación
  - Componentes del sistema
  - Protocolos y formatos
  - Decisiones técnicas

- **[SESSION_TRACKING_UPDATE.md](SESSION_TRACKING_UPDATE.md)** - Sistema de sesiones
  - Gestión de sesiones de tracking
  - Formato de persistencia JSON
  - Lifecycle de sesiones

### Testing y Desarrollo

- **[TESTING_GUIDE.md](TESTING_GUIDE.md)** - Guía de testing
  - Verificación de imports
  - Tests unitarios (estructura sugerida)
  - Testing manual con edge-agent
  - Debugging y profiling

### Ejemplos y Uso

<!-- Se simplificó la documentación: ver ARCHITECTURE y TESTING_GUIDE -->
  - Casos de uso comunes
  - Ejemplos de configuración
  - Integración con edge-agent

### Artefactos

- **[artefactos-del-worker.md](artefactos-del-worker.md)** - Artefactos generados
  - Estructura de archivos de salida
  - Formatos de datos

## 🚀 Inicio Rápido

1. Lee [ARCHITECTURE.md](ARCHITECTURE.md) para entender la arquitectura
2. Consulta [TESTING_GUIDE.md](TESTING_GUIDE.md) para ejecutar y verificar
3. (Opcional) Revisa [examples.md](examples.md) para casos de uso

## 📖 Navegación por Tema

### Para Desarrolladores
- Arquitectura → [ARCHITECTURE.md](ARCHITECTURE.md)
- Testing → [TESTING_GUIDE.md](TESTING_GUIDE.md)
- Implementación → [IMPLEMENTATION.md](IMPLEMENTATION.md)

### Para Usuarios
- Ejemplos → [examples.md](examples.md)
- Sesiones → [SESSION_TRACKING_UPDATE.md](SESSION_TRACKING_UPDATE.md)
- Artefactos → [artefactos-del-worker.md](artefactos-del-worker.md)

### Para Mantenedores
- Arquitectura → [ARCHITECTURE.md](ARCHITECTURE.md)
- Testing → [TESTING_GUIDE.md](TESTING_GUIDE.md)
