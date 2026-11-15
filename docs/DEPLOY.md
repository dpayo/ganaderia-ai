# Instalación, pruebas en el móvil y despliegue

## 1. Requisitos

- Ordenador con **Docker Desktop** (o Docker + Compose en Linux).
- **Node.js 20+** para la app.
- iPhone y/o Android con la app **Expo Go** (App Store / Google Play), **conectados a la misma wifi** que el ordenador.

## 2. Arrancar el backend (5 minutos)

```bash
cd ganaderia-ai
cp .env.example .env          # edita las contraseñas y JWT_SECRET
docker compose up -d --build
docker compose exec api python -m scripts.seed_demo   # opcional: usuario demo@ganaderia.ai / Demo1234!
```

Comprueba en el navegador: `http://localhost:8000/docs`.

Averigua la IP local de tu ordenador:
- macOS: `ipconfig getifaddr en0`
- Windows: `ipconfig` → "Dirección IPv4"
- Linux: `hostname -I`

Desde el móvil abre `http://<IP>:8000/health` en el navegador: debe responder `{"status":"ok"}`. Si no, revisa el cortafuegos del ordenador (permitir el puerto 8000).

## 3. Probar la app en iPhone y Android (Expo Go)

```bash
cd mobile
npm install
echo "EXPO_PUBLIC_API_URL=http://<IP>:8000" > .env
npx expo start
```

- **iPhone**: abre la Cámara del iPhone y escanea el QR que aparece en la terminal.
- **Android**: abre Expo Go → "Scan QR code".

Si no ves el QR o la red de la oficina bloquea conexiones entre equipos: `npx expo start --tunnel`.

> Si no defines `EXPO_PUBLIC_API_URL`, la app usa la misma IP del servidor de Expo con el puerto 8000.

### Flujo de prueba recomendado

1. Crea una cuenta (o entra con la demo) y una explotación.
2. Registra 3–5 animales reales con su crotal (o impórtalos en Configuración → Importar CSV/Excel).
3. Pulsa el botón amarillo **Cámara** y fotografía un crotal real. Acepta la coincidencia → la foto queda en la galería del animal.
4. Prueba también: foto desde la Galería, un crotal no registrado (→ alta precargada), y modo avión (→ búsqueda manual en la caché local).

## 4. Evaluar el OCR con tus fotos reales

Ver [TESTING_REAL_PHOTOS.md](TESTING_REAL_PHOTOS.md). Resumen:

```bash
docker compose cp ./mis_fotos api:/app/fotos
docker compose exec api python -m scripts.ocr_eval /app/fotos
```

## 5. App instalable (sin Expo Go): EAS Build

```bash
cd mobile
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --profile preview --platform android   # genera un .apk instalable
npx eas-cli@latest build --profile preview --platform ios       # requiere cuenta Apple Developer (TestFlight / ad hoc)
```

Para builds instalables el backend debe servirse por **HTTPS** (iOS bloquea HTTP en apps de producción). Define `EXPO_PUBLIC_API_URL=https://api.tudominio.es` en el perfil de EAS.

## 6. Producción

1. Servidor en la UE (p. ej. Hetzner, OVH, Scaleway) con Docker.
2. Proxy inverso con TLS (Caddy recomendado):
   ```
   api.tudominio.es {
     reverse_proxy localhost:8000
   }
   ```
   y en `docker-compose.yml` cambia el puerto a `127.0.0.1:8000:8000`.
3. `.env`: `ENVIRONMENT=production`, secretos largos aleatorios, `CORS_ORIGINS` restringido.
4. Almacenamiento: MinIO con disco cifrado, o un S3 gestionado en región UE (cambia `S3_ENDPOINT_URL`, claves y bucket). Las fotos nunca son públicas; el bucket usa cifrado de servidor (SSE).
5. Copias de seguridad diarias (cron):
   ```bash
   docker compose exec -T db pg_dump -U ganaderia -Fc ganaderia > backup_$(date +%F).dump
   docker run --rm -v ganaderia-ai_miniodata:/data -v $PWD:/b alpine tar czf /b/fotos_$(date +%F).tgz /data
   ```
   Guarda las copias fuera del servidor y prueba la restauración (`pg_restore`) periódicamente.
6. Actualizaciones: `git pull && docker compose up -d --build` (las migraciones Alembic se aplican al arrancar).

## 7. Desarrollo del backend sin Docker

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt        # y tesseract-ocr del sistema (brew/apt)
export DATABASE_URL=postgresql+psycopg://ganaderia:ganaderia@localhost:5432/ganaderia
alembic upgrade head
uvicorn app.main:app --reload --host 0.0.0.0
```

## 8. Tests

```bash
# Backend (PostgreSQL real). Los tests usan TEST_DATABASE_URL y se niegan a ejecutarse
# contra una BD cuyo nombre no termine en _test.
cd backend && pytest
# o dentro de Docker:
docker compose exec db createdb -U ganaderia ganaderia_test
docker compose exec -e TEST_DATABASE_URL=postgresql+psycopg://ganaderia:<POSTGRES_PASSWORD>@db:5432/ganaderia_test api pytest

# App
cd mobile && npm test && npm run typecheck
```
