# Protocolo de prueba con fotografías reales de crotales

Los tests automáticos usan crotales **sintéticos** generados por código. Sirven para garantizar que el pipeline funciona, pero **no miden** la precisión real. Este protocolo sí.

## 1. Recoger fotos

- 30–50 fotos de al menos 15 animales distintos, hechas con el móvil en condiciones reales: sol, sombra, crotal sucio, ángulo, distancia de 30 cm a 1,5 m.
- Nombra cada archivo con el identificador correcto: `ES040812345678.jpg`, `ES040812345678_2.jpg`…

## 2. Ejecutar la evaluación

```bash
docker compose cp ./fotos api:/app/fotos
docker compose exec api python -m scripts.ocr_eval /app/fotos
# Comparar con Google Vision (requiere GOOGLE_VISION_API_KEY en .env):
docker compose exec api python -m scripts.ocr_eval /app/fotos --provider google_vision
```

Salida: por foto, si el identificador correcto es el primer candidato (top-1) o está entre los 5 primeros (top-5), y el tiempo medio.

## 3. Interpretar

| top-1 | Recomendación |
|---|---|
| ≥ 85 % | Suficiente para uso diario con confirmación humana |
| 60–85 % | Mejorar encuadre/linterna; valorar Google Vision |
| < 60 % | Cambiar a `OCR_PROVIDER=google_vision` o entrenar un detector de crotal (Fase 3) |

Tesseract es un OCR genérico: funciona bien con crotales limpios y de frente, peor con crotales curvados, sucios o con reflejos. La arquitectura permite cambiar de proveedor sin tocar la app.

## 4. Mejoras previstas si la precisión no basta

1. Detector del crotal (YOLO pequeño) para recortar la zona antes del OCR.
2. Modelo de reconocimiento de texto ajustado con las fotos ya confirmadas en la app (cada confirmación es una etiqueta gratis).
3. Lectura de crotales electrónicos (lector RFID Bluetooth) como alternativa al OCR.
