# flightbox Plan 2 — Web UI + claims-vs-reality — Diseño

**Fecha**: 2026-07-05
**Estado**: Aprobado en brainstorming, pendiente de planes de implementación
**Depende de**: Plan 1 (core + CLI), ya mergeado en `main`

## Resumen

Segunda fase de flightbox: una UI web local que hace navegable la caja negra de sesiones agénticas, y un panel **claims-vs-reality** que compara, de forma estructural y determinista, lo que el agente **intentó** editar contra lo que **ejecutó con éxito**.

Sin NLP: la comparación usa señales estructurales de los hooks (PreToolUse = intento, PostToolUse = resultado) y de los transcripts (`tool_use`), no escaneo de texto.

## Alcance

### Dentro

- **Ingestión de outcomes**: extender el ingester para procesar eventos **PostToolUse** (hoy capturados en crudo pero descartados por el normalizador) y persistir éxito/fallo por archivo en una tabla nueva `tool_outcomes`.
- **Servidor HTTP local** (`node:http`, sin frameworks): expone el `Store` de solo lectura como API JSON en `127.0.0.1`, sin auth.
- **SPA React** (Vite): vista lista de sesiones + vista de sesión con tres zonas (cabecera-resumen, timeline, claims-vs-reality).
- **Comando `flightbox ui`**: re-ingesta, levanta el server en puerto libre, abre el navegador, foreground hasta Ctrl-C.

### Fuera (v3+)

- Streaming en vivo de sesiones en curso.
- Claims-vs-reality a nivel de diff (comparar el contenido, no solo el path/outcome).
- Export de sesión a memoria (markdown para CLAUDE.md).
- Menciones de texto en las respuestas del agente (la capa NLP que se descartó para v1).

### Principio innegociable (heredado)

100% local, cero telemetría, sin llamadas de red. El server escucha solo en `127.0.0.1`. Única prod dep sigue siendo `better-sqlite3`; Vite/React son dev deps y lo servido es estático.

## Claims-vs-reality: modelo de datos

Para que "intentó vs ejecutó" sea significativo hacen falta dos señales del mismo edit:

- **Intentó (attempted)**: bloque `Edit`/`Write`/`NotebookEdit` emitido por el agente. Fuente: PreToolUse (hooks) y/o `tool_use` (transcripts). Ya se persiste como `file_touches`.
- **Ejecutó con éxito (outcome)**: resultado real de la herramienta, en el `tool_response` de **PostToolUse**. NUEVO: el normalizador debe procesarlo.

### Detección éxito/fallo

El formato exacto del `tool_response` de PostToolUse NO es API pública (mismo riesgo que el formato de transcripts en Plan 1). Mitigación:

1. **La primera tarea del Plan 2a captura y vuelca un PostToolUse real** para fijar la heurística de éxito/fallo antes de escribir el parser.
2. Diseño defensivo: `tool_outcomes` guarda el outcome crudo (`raw_response` truncado) además del veredicto derivado (`success: boolean | null`), para poder re-ingestar y refinar sin perder datos.
3. Heurística inicial (a confirmar en Task 1): un `tool_response` con campo de error / marca de fallo → `success = false`; con resultado normal → `success = true`; sin señal clara → `null` (desconocido).

### Vista claims-vs-reality (por sesión)

Cada archivo con edit intentado se clasifica:

- **✓ funcionó** — hubo intento y outcome exitoso.
- **✗ falló** — hubo intento y outcome de fallo.
- **⚠ intentado sin resultado** — hubo intento pero no hay PostToolUse (sesión interrumpida, o hooks no instalados).

### Modo degradado

Sesión solo-transcript (anterior a instalar hooks): edits intentados visibles, todos `⚠ sin resultado`, con aviso "hooks no instalados en esta sesión". Nunca pantalla vacía.

## Arquitectura

```
raw PostToolUse ──► ingester (nuevo path) ──► Store: tabla tool_outcomes
Store (SQLite, existe) ───────────────────────────────┤
                                                       ▼
                                        api-server (node:http, 127.0.0.1)
                                          GET /api/sessions
                                          GET /api/sessions/:id
                                          GET /api/sessions/:id/claims
                                                       │
                                                       ▼
                                        React SPA (build Vite, servido estático)
                                                       ▲
                                        flightbox ui ──┘ (ingesta + server + navegador)
```

**Decisiones:**

1. **Servidor `node:http` puro** — sin Express. Solo lectura del Store. Sin auth. `127.0.0.1` únicamente.
2. **Frontend Vite/React como dev deps** — el build produce estáticos servidos por el mismo server; un solo proceso en producción.
3. **La API JSON es la frontera** — el SPA nunca toca SQLite; todo por endpoints. Backend testeable con `fetch` sin navegador.

## División en dos planes

Subsistemas independientes; cada uno entrega software funcional y testeable por sí solo:

- **Plan 2a — Backend**: `tool_outcomes` + normalizador PostToolUse + servidor HTTP + tres endpoints + queries de agregación (incl. claims-vs-reality). Al terminar: `curl 127.0.0.1:<port>/api/sessions/<id>/claims` devuelve el JSON correcto.
- **Plan 2b — Frontend**: SPA React (tres zonas + vista lista), build Vite, comando `flightbox ui`. Consume la API que 2a dejó probada.

## UX

### `flightbox ui`

1. Corre `runIngest` una vez (datos frescos, como los demás comandos).
2. Levanta el server en `127.0.0.1`, puerto libre empezando en 51789 (incrementa si ocupado).
3. Imprime la URL y abre el navegador (`open` macOS / `xdg-open` Linux / `start` Windows); si falla, solo imprime la URL — nunca lanza.
4. Foreground hasta Ctrl-C.

### SPA — dos vistas

**Lista (`/`)**: tabla de sesiones (proyecto, fecha, duración, tokens, nº archivos, badge si hay discrepancias). Clic → detalle.

**Sesión (`/session/:id`)** — tres zonas:

1. **Cabecera-resumen**: duración, tokens (in/out/cache), archivos tocados, comandos, subagentes, modelo(s).
2. **Timeline**: feed cronológico colapsable, filtrable por tipo (herramientas/archivos/comandos/subagentes), buscable por texto o ruta. Eventos `sidechain` (subagentes) anidados bajo su evento.
3. **Claims-vs-reality**: por archivo, ✓ funcionó / ✗ falló / ⚠ intentado sin resultado. Aviso en modo degradado.

### Estados degradados

- Sin discrepancias → zona 3 muestra "todo lo intentado se ejecutó ✓".
- Sesión sin transcript → timeline solo de hooks con aviso.
- Nunca pantalla vacía si hay algún dato.

## Testing

- **Backend (2a, cobertura principal)**: `vitest` levanta el server contra SQLite de fixtures y hace `fetch` a cada endpoint; golden tests de la query claims-vs-reality con las tres clases de outcome; test del normalizador PostToolUse con payloads reales anonimizados.
- **Frontend (2b)**: tests de componente de la timeline y del panel claims-vs-reality con fixtures; smoke test de que el build servido responde 200. Sin e2e pesado.

## Criterio de éxito

- `flightbox ui` abre en <2s con datos ya ingeridos.
- La API responde correctamente para sesiones con hooks, solo-transcript, y mixtas.
- Claims-vs-reality no da falsos positivos (es determinista y estructural).
- Cero regresiones en el CLI existente; única prod dep sigue siendo `better-sqlite3`.

## Riesgos

- **Formato de `tool_response` de PostToolUse desconocido / cambiante**: no es API pública. Mitigación: Task 1 de 2a lo captura y fija; almacenamiento defensivo (raw + veredicto) permite re-ingestar.
- **`flightbox ui` como proceso foreground**: a diferencia del resto del CLI, se queda vivo. Debe manejar Ctrl-C limpio y liberar el puerto.
- **Vendors construyen esto nativo**: mitigación (heredada), ser tool-agnostic vía ATF.

## Nota de idioma

Spec interno en español; artefactos públicos (README, UI, API) en inglés.
