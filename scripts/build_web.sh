#!/usr/bin/env sh
# Genera la versión web de la app y la copia al backend, que la sirve en "/".
set -e
cd "$(dirname "$0")/../mobile"
npm ci --no-audit --no-fund
rm -rf dist
npx expo export --platform web
rm -rf ../backend/web
cp -r dist ../backend/web
echo "Listo: backend/web actualizado. Haz commit y push para publicarlo."
