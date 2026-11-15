# Ganadería AI

Aplicación móvil (iOS y Android) para la gestión de explotaciones ganaderas con identificación de animales mediante la cámara: fotografías el crotal, la app lo lee por OCR y abre la ficha del animal.

> **Estado: Fase 1 (MVP) completa.** Ganadería AI es una herramienta de gestión interna y **no sustituye** a los sistemas oficiales de identificación y trazabilidad (SITRAN, REGA, libro de explotación).

## Qué incluye la Fase 1

- Registro, inicio de sesión (JWT con renovación) y explotaciones con usuarios y roles.
- Inventario de animales: alta, edición con bloqueo optimista, baja (venta/muerte/traslado), eliminación lógica, búsqueda y filtros, lotes, genealogía.
- Ficha con foto principal y galería (cámara o galería del móvil).
- **Identificación por cámara**: OCR de crotales españoles (ES + 12 dígitos, 724 + 12, nº de manejo), tolerancia a 1 dígito mal leído, porcentaje de confianza y confirmación humana antes de guardar nada.
- Búsqueda manual por identificador, también **sin conexión** (caché SQLite en el móvil).
- Dashboard: censo, nacimientos y bajas del mes, evolución de 12 meses, avisos reales.
- Importación (con validación previa) y exportación CSV / Excel.
- Registro de actividad (auditoría de todos los cambios).

Lo que pertenece a fases posteriores (sanidad, nacimientos, movimientos, alimentación, asistente IA, voz, reconocimiento visual) aparece en la app como "Disponible en Fase N", sin datos simulados. Las integraciones externas no disponibles tienen interfaces desacopladas (`backend/app/ai/visual.py`, `backend/app/integrations/official.py`).

## Empezar

Guía completa: **[docs/DEPLOY.md](docs/DEPLOY.md)**. Resumen:

```bash
cp .env.example .env && docker compose up -d --build     # backend + PostgreSQL + MinIO
cd mobile && npm install && npx expo start               # escanea el QR con Expo Go
```

## Documentación

| Documento | Contenido |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitectura, diagrama de componentes, modelo E-R, flujo de cámara, stack, plan por fases |
| [docs/API.md](docs/API.md) · [openapi.json](docs/openapi.json) | API REST |
| [docs/UX.md](docs/UX.md) | Diseño UX/UI y pantallas |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Instalación, pruebas en el móvil, despliegue, copias de seguridad |
| [docs/TESTING_REAL_PHOTOS.md](docs/TESTING_REAL_PHOTOS.md) | Cómo medir la precisión del OCR con tus crotales |

## Estructura

```
ganaderia-ai/
├── docker-compose.yml        PostgreSQL · MinIO (S3) · API · n8n (perfil automation, Fase 2)
├── backend/                  Python · FastAPI · SQLAlchemy 2 · Alembic
│   ├── app/
│   │   ├── api/v1/           Routers REST (auth, farms, animals, media, dashboard)
│   │   ├── services/         Lógica de negocio (animales, identificación, auditoría)
│   │   ├── ai/               OCR (Tesseract / Google Vision), parser de crotales, visión (interfaz)
│   │   ├── media/            Normalización de imágenes y almacenamiento S3/local
│   │   ├── integrations/     Interfaz para registros oficiales (sin implementar)
│   │   ├── models.py         Modelo de datos
│   │   └── schemas.py        Validación (Pydantic)
│   ├── alembic/versions/     Migraciones
│   ├── scripts/              seed_demo, ocr_eval
│   └── tests/                27 tests (PostgreSQL real + Tesseract real)
├── mobile/                   Expo SDK 58 · React Native · TypeScript estricto
│   ├── src/app/              Pantallas (Expo Router)
│   ├── src/components/       Componentes reutilizables
│   ├── src/lib/              API, auth, caché offline, parser, tema
│   └── __tests__/            Tests Jest
└── docs/
```

## Calidad verificada

- Backend: 27 tests (auth, aislamiento entre explotaciones, permisos, CRUD, bloqueo optimista, import/export, sincronización, OCR extremo a extremo) sobre PostgreSQL 16 y Tesseract 5. `ruff` sin avisos. Migraciones probadas arriba y abajo.
- App: `tsc --strict` sin errores, 19 tests Jest, bundle de Metro para iOS y Android generado correctamente.
