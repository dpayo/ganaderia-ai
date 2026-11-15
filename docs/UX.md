# Diseño UX/UI

## Principios para el entorno rural

- **Una mano, con guantes**: objetivos táctiles de 56 pt mínimo (más que los 44 pt de Apple), acciones principales abajo, al alcance del pulgar.
- **Cámara siempre a un toque**: botón central amarillo "crotal" en la barra inferior y tarjeta grande en Inicio.
- **Legible al sol**: alto contraste, texto mínimo de 16 pt en datos, número de manejo en grande en la ficha.
- **Confirmar antes de guardar**: toda propuesta de la IA muestra porcentaje de confianza y requiere un toque explícito.
- **Honestidad**: los módulos de fases futuras se muestran como "Disponible en Fase N", sin datos simulados.
- **Sin cobertura**: la app avisa del modo offline y ofrece búsqueda local.
- Modo claro/oscuro automático según el sistema. Interfaz en español.

## Paleta

| Uso | Claro | Oscuro |
|---|---|---|
| Primario (verde campo) | `#1F5130` | `#5DB57A` |
| Acento / cámara (amarillo crotal) | `#E8A317` | `#F2B636` |
| Fondo | `#F5F5F0` | `#0F120F` |
| Superficie | `#FFFFFF` | `#1A1E1A` |
| Peligro | `#C0392B` | `#EF6F61` |

Definida en `mobile/src/lib/theme.ts`.

## Navegación

```
Barra inferior:  Inicio · Animales · [ CÁMARA ] · Actividad · Asistente IA
                                       ▲ botón elevado, amarillo, 72 pt
```

## Pantallas (Fase 1)

| # | Pantalla | Archivo | Estado |
|---|---|---|---|
| 1 | Login y registro | `src/app/(auth)/login.tsx`, `register.tsx` | ✅ |
| 2 | Dashboard | `src/app/(tabs)/home.tsx` | ✅ (sanidad: Fase 2) |
| 3 | Inventario | `src/app/(tabs)/animals.tsx` | ✅ búsqueda, filtros, scroll infinito |
| 4 | Ficha individual | `src/app/animal/[id].tsx` | ✅ galería, genealogía, baja |
| 5 | Cámara inteligente | `src/app/identify/camera.tsx` | ✅ guía de encuadre, linterna, zoom, galería |
| 6 | Resultado de identificación | `src/app/identify/result.tsx` | ✅ confianza, confirmar, alternativas |
| 7 | Alta / edición de animal | `src/app/animal/form.tsx` | ✅ validación de crotal en vivo |
| 8 | Historial sanitario | — | Fase 2 |
| 9 | Registro de nacimiento | — | Fase 2 |
| 10 | Alimentación | — | Fase 2 |
| 11 | Movimientos | — | Fase 2 (las bajas ya se registran) |
| 12 | Calendario | — | Fase 2 |
| 13 | Asistente IA | `src/app/(tabs)/assistant.tsx` | Fase 3 (pantalla informativa) |
| 14 | Configuración de explotación | `src/app/settings.tsx`, `farm-setup.tsx` | ✅ lotes, usuarios, import/export |
| + | Búsqueda manual | `src/app/identify/manual.tsx` | ✅ funciona sin conexión |
| + | Actividad | `src/app/(tabs)/activity.tsx` | ✅ registro de auditoría |

## Flujo de la cámara

```
[Cámara] ──foto──▶ "Leyendo crotal…" ──▶ Resultado
                                         ├─ 1 coincidencia ─▶ "¿Es este animal?" ─▶ Sí → Ficha (+ foto en galería)
                                         ├─ varias ─────────▶ elegir de la lista
                                         ├─ no registrado ──▶ "Dar de alta ES …" (formulario precargado + foto)
                                         └─ ilegible ───────▶ Repetir · Escribir · Buscar · Visual (Fase 3)
         sin conexión ──▶ "Escribir número" ─▶ búsqueda en caché local
```
