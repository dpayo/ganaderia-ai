# Ganadería AI — Documento de arquitectura técnica

Versión 0.1 · Fase 1 (MVP) · Noviembre 2026

> Ganadería AI es una herramienta de gestión interna de la explotación. **No sustituye** a los sistemas oficiales de identificación y trazabilidad (SITRAN, REGA, RIIA, libro de explotación oficial). Cualquier integración con ellos se hará solo mediante interfaces y permisos legalmente autorizados (ver §8).

---

## 1. Arquitectura propuesta

Arquitectura cliente-servidor **offline-first**, con un backend modular ("monolito modular") que separa claramente dominios. Se elige monolito modular frente a microservicios porque para una explotación pequeña/mediana y un equipo reducido minimiza coste operativo, y los módulos están desacoplados por interfaces para extraerse a servicios cuando la carga lo justifique (el primer candidato es el procesamiento de imágenes/IA).

Capas:

| Capa | Responsabilidad | Ubicación |
|---|---|---|
| App móvil | UI, cámara, caché local SQLite, cola offline | `mobile/` |
| API | HTTP/REST, auth, validación de entrada (Pydantic) | `backend/app/api/` |
| Lógica de negocio | Reglas de dominio (animales, explotaciones, permisos) | `backend/app/services/` |
| Servicios de IA | OCR, parser de crotales, (futuro) embeddings visuales, LLM | `backend/app/ai/` |
| Procesamiento multimedia | Normalización, compresión, miniaturas, almacenamiento | `backend/app/media/` |
| Persistencia | Modelos SQLAlchemy, migraciones Alembic | `backend/app/models/`, `backend/alembic/` |
| Infraestructura | PostgreSQL, almacenamiento S3 (MinIO), n8n (fase 2) | `docker-compose.yml` |

Principios:

- **Multi-tenant por explotación**: toda entidad de negocio cuelga de `farm_id`; el acceso se valida por pertenencia (`farm_users`) y rol en cada petición.
- **Proveedores intercambiables**: OCR, almacenamiento, reconocimiento visual y LLM se definen como interfaces (`Protocol`) con implementaciones seleccionables por configuración. Si un proveedor externo no está configurado, la capacidad se declara como no disponible en lugar de simularse.
- **Humano en el bucle**: la IA propone, el usuario confirma. Ningún resultado de OCR o visión modifica datos sin confirmación explícita.
- **Auditoría**: toda escritura genera un registro en `audit_logs`.

## 2. Diagrama de componentes

```mermaid
flowchart LR
  subgraph Movil["App móvil (Expo / React Native)"]
    UI[Pantallas Expo Router]
    CAM[Cámara expo-camera]
    IMG[Compresión expo-image-manipulator]
    SQL[(SQLite local<br/>caché + cola)]
    SYNC[Sync manager]
    UI --> CAM --> IMG
    UI <--> SQL
    SYNC <--> SQL
  end

  subgraph API["Backend FastAPI"]
    R[Routers REST /api/v1]
    AUTH[Auth JWT + RBAC por explotación]
    BIZ[Servicios de dominio]
    MEDIA[Media service]
    subgraph AI["Servicios IA"]
      OCR[OCR provider<br/>Tesseract / Google Vision]
      PARSER[Parser de crotales ES]
      VIS[Visual matcher<br/>interfaz · fase 3]
      LLM[LLM tools · fase 3]
    end
    AUDIT[Audit log]
    R --> AUTH --> BIZ
    BIZ --> MEDIA
    BIZ --> OCR --> PARSER
    BIZ -.-> VIS
    BIZ -.-> LLM
    BIZ --> AUDIT
  end

  PG[(PostgreSQL)]
  S3[(S3 / MinIO<br/>fotografías)]
  N8N[n8n · fase 2<br/>tareas y avisos]
  OFF[Sistemas oficiales<br/>SITRAN · futuro, autorizado]

  SYNC -- HTTPS JSON / multipart --> R
  BIZ --> PG
  MEDIA --> S3
  N8N -.-> R
  BIZ -.-> OFF
```

## 3. Modelo de datos

### 3.1 Diagrama entidad-relación

Las entidades marcadas *(F1)* están implementadas y migradas en la Fase 1. El resto está diseñado y se migrará en su fase.

```mermaid
erDiagram
  USERS ||--o{ FARM_USERS : "pertenece"
  FARMS ||--o{ FARM_USERS : "tiene"
  FARMS ||--o{ HERD_GROUPS : "lotes"
  FARMS ||--o{ ANIMALS : "censo"
  HERD_GROUPS ||--o{ ANIMALS : "agrupa"
  ANIMALS ||--o{ ANIMAL_PHOTOS : "galería"
  ANIMALS ||--o{ ANIMAL_IDENTIFICATIONS : "intentos"
  ANIMALS |o--o{ ANIMALS : "madre/padre"
  ANIMALS ||--o{ ANIMAL_MOVEMENTS : "trazabilidad"
  ANIMALS ||--o{ ANIMAL_HEALTH_RECORDS : "sanidad"
  ANIMAL_HEALTH_RECORDS ||--o{ TREATMENTS : ""
  ANIMALS ||--o{ VACCINATIONS : ""
  ANIMALS ||--o| BIRTHS : "nacimiento"
  HERD_GROUPS ||--o{ FEED_RECORDS : "alimentación"
  SUPPLIERS ||--o{ FEED_RECORDS : ""
  FARMS ||--o{ SUPPLIERS : ""
  USERS ||--o{ NOTIFICATIONS : ""
  FARMS ||--o{ AUDIT_LOGS : ""

  USERS {
    uuid id PK
    string email UK
    string password_hash
    string full_name
    bool is_active
    timestamptz created_at
  }
  FARMS {
    uuid id PK
    string name
    string rega_code "código REGA (opcional)"
    string species_default
    string province
    timestamptz created_at
  }
  FARM_USERS {
    uuid id PK
    uuid farm_id FK
    uuid user_id FK
    enum role "owner|manager|worker|vet|viewer"
  }
  HERD_GROUPS {
    uuid id PK
    uuid farm_id FK
    string name
    string description
  }
  ANIMALS {
    uuid id PK
    uuid farm_id FK
    string official_id
    string official_id_normalized
    string internal_id
    string species
    string breed
    enum sex
    date birth_date
    numeric weight_kg
    uuid mother_id FK
    uuid father_id FK
    uuid herd_group_id FK
    enum status "active|sold|dead|transferred"
    enum health_status
    uuid main_photo_id FK
    text notes
    timestamptz deleted_at
    int version
  }
  ANIMAL_PHOTOS {
    uuid id PK
    uuid farm_id FK
    uuid animal_id FK
    string storage_key
    string content_type
    int width
    int height
    int size_bytes
    string sha256
    enum kind "tag|body|face|other"
    uuid uploaded_by FK
    timestamptz taken_at
  }
  ANIMAL_IDENTIFICATIONS {
    uuid id PK
    uuid farm_id FK
    uuid animal_id FK "nullable hasta confirmar"
    uuid photo_id FK
    enum method "ocr|manual|search|visual"
    string ocr_provider
    text raw_text
    json candidates
    float confidence
    enum status "matched|ambiguous|not_found|unreadable|confirmed|rejected"
    uuid confirmed_by FK
    timestamptz created_at
  }
  AUDIT_LOGS {
    bigint id PK
    uuid farm_id FK
    uuid user_id FK
    string entity
    uuid entity_id
    enum action "create|update|delete|confirm"
    json changes
    timestamptz created_at
  }
  ANIMAL_MOVEMENTS {
    uuid id PK
    uuid animal_id FK
    enum type "entry|exit|transfer|group_change|farm_change"
    uuid from_farm_id
    uuid to_farm_id
    uuid from_group_id
    uuid to_group_id
    date moved_at
    string document_ref
  }
  ANIMAL_HEALTH_RECORDS {
    uuid id PK
    uuid animal_id FK
    enum type "checkup|disease|incident|deworming"
    date date
    string diagnosis
    string vet_name
    text notes
  }
  TREATMENTS {
    uuid id PK
    uuid health_record_id FK
    string medicine
    string dose
    date start_date
    date end_date
    int withdrawal_days
  }
  VACCINATIONS {
    uuid id PK
    uuid animal_id FK
    string vaccine
    string batch
    date applied_at
    date next_due_at
  }
  BIRTHS {
    uuid id PK
    uuid farm_id FK
    uuid calf_id FK
    uuid mother_id FK
    uuid father_id FK
    date born_at
    numeric weight_kg
    text incidents
  }
  FEED_RECORDS {
    uuid id PK
    uuid farm_id FK
    uuid herd_group_id FK
    uuid supplier_id FK
    string feed_type
    numeric quantity_kg
    numeric cost_eur
    date date
  }
  SUPPLIERS {
    uuid id PK
    uuid farm_id FK
    string name
    string tax_id
    string phone
  }
  NOTIFICATIONS {
    uuid id PK
    uuid user_id FK
    uuid farm_id FK
    string type
    string title
    json payload
    timestamptz due_at
    timestamptz read_at
  }
```

### 3.2 Restricciones e índices clave (F1)

- `animals`: `UNIQUE (farm_id, official_id_normalized) WHERE deleted_at IS NULL` y `UNIQUE (farm_id, internal_id) WHERE deleted_at IS NULL AND internal_id IS NOT NULL` (índices parciales). El identificador oficial es único **por explotación**; un mismo crotal puede existir en dos explotaciones (p. ej. tras una venta) sin colisión, y la trazabilidad se conserva en `animal_movements`.
- Índice `ix_animals_official_suffix` sobre `right(official_id_normalized, 4)` para búsqueda por **número de manejo** (los 4 últimos dígitos, impresos en grande en el crotal).
- `CHECK (mother_id <> id)`, `CHECK (father_id <> id)`, `CHECK (weight_kg > 0)`.
- Borrado lógico (`deleted_at`) para animales: la baja nunca destruye historial.
- Bloqueo optimista con `version` para resolver conflictos de sincronización offline.
- `farm_users (farm_id, user_id)` único.

### 3.3 Formato de crotales españoles (parser)

El parser (`backend/app/ai/tag_parser.py`, replicado en `mobile/src/lib/tagParser.ts`) reconoce:

- **Código oficial**: `ES` + 12 dígitos (bovino, ovino, caprino). Tolera espacios, guiones y confusiones OCR habituales (`O→0`, `I/l→1`, `S→5`, `B→8`, `Z→2`) **solo en la parte numérica**.
- **Identificador electrónico ISO 11784**: `724` (código numérico de España) + 12 dígitos, que se normaliza a `ES` + 12 dígitos.
- **Número de manejo**: 4–6 dígitos aislados, usados para buscar por sufijo cuando el código completo no es legible.

> Verificar la longitud y estructura vigente para cada especie con la normativa autonómica antes de producción. El parser es configurable y cubierto por tests.

## 4. Flujo de identificación mediante cámara

```mermaid
sequenceDiagram
  actor G as Ganadero
  participant App as App móvil
  participant API as API /identify
  participant OCR as OCR provider
  participant P as Parser crotales
  participant DB as PostgreSQL
  participant S3 as Almacén fotos

  G->>App: Pulsa botón Cámara (barra inferior)
  App->>App: Encuadre guía del crotal + flash opcional
  G->>App: Dispara
  App->>App: Redimensiona (1600 px) y comprime JPEG 0.8
  App->>API: POST /farms/{id}/identify (multipart)
  API->>S3: Guarda imagen (privada)
  API->>OCR: Imagen preprocesada (gris, CLAHE, binarizado, 0/90/180/270°)
  OCR-->>API: Texto + confianza
  API->>P: Extrae candidatos (ES+12, 724+12, nº manejo)
  P-->>API: Candidatos normalizados
  API->>DB: Busca exacto → sufijo → identificador interno
  API->>DB: Registra intento (animal_identifications)
  API-->>App: status + coincidencias + confianza
  alt matched (1 coincidencia)
    App->>G: Muestra ficha + "¿Es este animal?"
    G->>App: Confirma
    App->>API: POST /identifications/{id}/confirm
    API->>DB: Asocia foto a la galería, audita
  else ambiguous
    App->>G: Lista de candidatos para elegir
  else not_found
    App->>G: "Crotal leído pero no registrado" → Alta de animal precargada
  else unreadable
    App->>G: Repetir foto · Introducir manualmente · Buscar · Coincidencias visuales (fase 3)
  end
```

Sin conexión: la app no puede ejecutar OCR en servidor, así que ofrece entrada manual y búsqueda sobre la caché local de SQLite, y conserva la foto en cola para subirla al recuperar cobertura.

### Reconocimiento visual (Fase 3, experimental)

Se define la interfaz `VisualMatcher` (`backend/app/ai/visual.py`). Hoy la implementación por defecto es `DisabledVisualMatcher`, que declara `available = False`; la app muestra la opción como "no disponible todavía". Plan de validación progresiva:

1. Recoger fotos etiquetadas por humanos (ya ocurre en F1: cada confirmación añade una foto verificada a la galería).
2. Generar embeddings (p. ej. DINOv2/CLIP o modelo propio de re-identificación) en `pgvector`.
3. Medir top-1/top-5 por raza, luz y ángulo sobre un conjunto de validación de la propia explotación.
4. Activar la sugerencia solo por encima de un umbral de precisión medido, siempre con confirmación humana y porcentaje de confianza visible.

## 5. Stack tecnológico definitivo

| Ámbito | Elección | Motivo |
|---|---|---|
| Móvil | Expo SDK 58, React Native 0.88, TypeScript estricto | iOS y Android con un código; pruebas inmediatas en Expo Go |
| Navegación | Expo Router (tabs + stack) | Rutas por archivos, deep links |
| Cámara | expo-camera (`CameraView`) + expo-image-picker (galería) | Incluidos en Expo Go; galería permite probar con fotos reales ya hechas |
| Imagen | expo-image-manipulator | Reducir peso antes de subir con mala cobertura |
| Local | expo-sqlite, expo-secure-store | Caché offline y tokens cifrados en llavero/Keystore |
| Estado servidor | TanStack Query | Caché, reintentos, invalidación |
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 | Tipado, rendimiento, ecosistema IA |
| BD | PostgreSQL 16 (+ pgvector en fase 3) | Integridad relacional, índices parciales, vectores |
| Fotos | S3 compatible (MinIO en local; AWS S3/Scaleway/OVH en producción, región UE) | RGPD: datos en la UE |
| OCR | Tesseract 5 (por defecto, autoalojado) · Google Cloud Vision (opcional, por config) | Coste cero de partida; proveedor cloud para mayor precisión |
| Auth | JWT de acceso (15 min) + refresh (30 días), bcrypt | Estándar, sin dependencias externas |
| Contenedores | Docker + Docker Compose | Despliegue reproducible |
| Automatización | n8n (fase 2) | Recordatorios de vacunas y vencimientos |
| LLM | API de LLM con *tool use* (fase 3) | Asistente con herramientas estructuradas, sin inventar datos |

## 6. Plan de desarrollo por fases

| Fase | Alcance | Criterio de salida |
|---|---|---|
| **1 · MVP** (este entregable) | Registro/login, explotaciones y roles, CRUD de animales con baja lógica, lotes, fichas con galería, cámara y galería del móvil, OCR de crotales, búsqueda por identificador y nº de manejo, dashboard básico, import/export CSV y Excel, auditoría, caché offline de consulta | Identificar un animal real fotografiando su crotal en iPhone y Android |
| **2 · Gestión avanzada** | Sanidad, vacunas, tratamientos (con plazos de supresión), nacimientos (alta automática del ternero), movimientos y trazabilidad, alimentación y costes, calendario, notificaciones push vía n8n, cola de escritura offline con resolución de conflictos | Ciclo completo de una temporada registrado en la app |
| **3 · IA** | Asistente con herramientas (consultas y escrituras con confirmación), registro por voz (transcripción → extracción → vista previa → confirmación), reconocimiento visual experimental con métricas | Precisión medida y documentada; 0 escrituras sin confirmación |
| **4 · Comercialización** | Suscripciones y planes, panel de administración, métricas de uso, multiempresa con varias explotaciones por cuenta, escalado horizontal, copias de seguridad gestionadas | Primeros clientes de pago |

## 7. Seguridad y RGPD

- HTTPS obligatorio en producción (terminación TLS en el proxy inverso; ver `DEPLOY.md`).
- Contraseñas con bcrypt; tokens en almacenamiento seguro del sistema (Keychain / Keystore).
- Autorización por explotación en cada endpoint; roles `owner`, `manager`, `worker`, `vet`, `viewer`.
- Fotos privadas: nunca públicas en el bucket; se sirven a través de la API con autenticación.
- Cifrado en reposo: cifrado de servidor del bucket (SSE) y del volumen de PostgreSQL en el proveedor.
- Auditoría de todas las modificaciones.
- Copias de seguridad: `pg_dump` diario + versionado del bucket (script en `DEPLOY.md`).
- RGPD: datos alojados en la UE, exportación de datos de la explotación (CSV/Excel), borrado de cuenta bajo petición (fase 4 automatizado), registro de actividades de tratamiento a cargo del titular del SaaS.

## 8. Integraciones futuras con sistemas oficiales

El módulo `backend/app/integrations/official.py` define la interfaz `OfficialRegistryClient` (consultar censo, notificar movimientos). No existe implementación: SITRAN y los sistemas autonómicos requieren alta, credenciales y autorización de la administración competente. Cuando se disponga de ellos se implementará un adaptador por comunidad autónoma sin tocar la lógica de negocio.
