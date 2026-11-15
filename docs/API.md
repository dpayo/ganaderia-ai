# API REST — Ganadería AI v0.1

- Base: `http://<servidor>:8000/api/v1`
- Documentación interactiva (Swagger): `http://<servidor>:8000/docs` · ReDoc: `/redoc`
- Especificación completa: [`openapi.json`](openapi.json)
- Autenticación: `Authorization: Bearer <access_token>` (15 min). Renovar con `POST /auth/refresh` (30 días).
- Errores: `{"detail": "mensaje en español"}` o, en validación (422), `{"detail": [{"loc": [...], "msg": "..."}]}`.

## Permisos por rol

| Rol | Leer | Crear / editar animales, fotos, identificar | Lotes: borrar · Importar · Eliminar animal · Editar explotación · Añadir usuarios |
|---|---|---|---|
| owner (titular) | ✓ | ✓ | ✓ |
| manager (gestor) | ✓ | ✓ | ✓ (no puede crear titulares) |
| worker (operario) · vet | ✓ | ✓ | — |
| viewer (solo lectura) | ✓ | — | — |

Acceder a una explotación ajena devuelve `404` (no se revela su existencia).

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register` | Alta de usuario → tokens |
| POST | `/auth/login` | Inicio de sesión → tokens |
| POST | `/auth/refresh` | Renueva tokens |
| GET | `/auth/me` | Usuario actual |
| GET · POST | `/farms` | Mis explotaciones · crear (el creador queda como titular) |
| GET · PATCH | `/farms/{farm_id}` | Ver · editar explotación |
| GET · POST | `/farms/{farm_id}/members` | Usuarios · dar acceso a un usuario registrado |
| GET · POST | `/farms/{farm_id}/groups` | Lotes (con nº de animales activos) · crear |
| PATCH · DELETE | `/farms/{farm_id}/groups/{group_id}` | Renombrar · borrar lote (animales quedan sin lote) |
| GET | `/farms/{farm_id}/animals` | Listado paginado. Filtros: `q`, `status`, `group_id`, `sex`, `sort`, `limit`, `offset` |
| POST | `/farms/{farm_id}/animals` | Alta. `from_identification_id` adjunta la foto de un intento de identificación |
| GET | `/farms/{farm_id}/animals/{id}` | Ficha con galería y padres |
| PATCH | `/farms/{farm_id}/animals/{id}` | Edición parcial. `expected_version` → `409` si otro dispositivo lo cambió |
| POST | `/farms/{farm_id}/animals/{id}/deactivate` | Baja: `sold` · `dead` · `transferred` (conserva historial) |
| DELETE | `/farms/{farm_id}/animals/{id}` | Eliminación lógica de un registro erróneo |
| GET | `/farms/{farm_id}/animals/lookup?code=` | Búsqueda por crotal, nº de manejo o identificador interno |
| GET | `/farms/{farm_id}/animals/sync?since=` | Cambios incrementales (incluye eliminados) para la caché offline |
| GET | `/farms/{farm_id}/animals/export?format=csv\|xlsx` | Exportación |
| POST | `/farms/{farm_id}/animals/import?dry_run=true` | Importación CSV/XLSX. Por defecto solo valida y devuelve informe |
| POST | `/farms/{farm_id}/animals/{id}/photos` | Subir foto (multipart `file`, `kind`, `set_as_main`) |
| GET | `/farms/{farm_id}/photos/{photo_id}/file?thumb=` | Descarga autenticada de la foto o miniatura |
| DELETE | `/farms/{farm_id}/photos/{photo_id}` | Borrar foto |
| POST | `/farms/{farm_id}/identify` | **Identificación por foto del crotal** (multipart `file`) |
| POST | `/farms/{farm_id}/identifications/{id}/confirm` | Confirmación humana: `{animal_id, attach_photo, set_as_main}` |
| POST | `/farms/{farm_id}/identifications/{id}/reject` | Descartar intento |
| GET | `/farms/{farm_id}/dashboard` | Indicadores, censo 12 meses, avisos |
| GET | `/farms/{farm_id}/activity` | Registro de actividad (auditoría) |
| GET | `/capabilities` | Qué capacidades de IA están disponibles en este despliegue |
| GET | `/health` | Estado (incluye conexión a BD) |

## Identificación: respuesta

```json
{
  "id": "6d0c…",
  "status": "matched",            // matched | ambiguous | not_found | unreadable
  "ocr_provider": "tesseract",
  "ocr_available": true,
  "raw_text": "ES04081234\n5678",
  "candidates": [{"value": "ES040812345678", "kind": "official", "confidence": 0.69}],
  "matches": [{
    "animal": { "id": "…", "official_id": "ES 0408 1234 5678", "name": "Lucera", "...": "..." },
    "confidence": 0.74,
    "matched_by": "official_exact",   // official_exact | official_fuzzy | management_suffix | internal_id
    "matched_value": "ES040812345678"
  }],
  "photo_id": "…",
  "photo_url": "/api/v1/farms/…/photos/…/file",
  "processing_ms": 163,
  "visual_search_available": false,
  "message": "Animal identificado. Confirma que es correcto."
}
```

`/identify` **nunca** modifica un animal: guarda la foto como no asignada y registra el intento. Solo `/confirm` la asocia a la ficha.

## Import / export: columnas

`identificador_oficial; identificador_interno; nombre; especie; raza; sexo; fecha_nacimiento; fecha_entrada; peso_kg; lote; observaciones`

- CSV con `;` o `,`, UTF-8 (con o sin BOM). Fechas `AAAA-MM-DD`. Sexo `hembra`/`macho` (o `h`/`m`). Peso con coma o punto.
- El lote debe existir previamente.
