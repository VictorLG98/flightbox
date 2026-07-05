# flightbox — Diseño

**Fecha**: 2026-07-05
**Estado**: Aprobado en brainstorming, pendiente de plan de implementación
**Nombre de trabajo**: `flightbox` (revisable antes de publicar)

## Resumen

Herramienta open source, local-first, que graba sesiones de agentes de código y las convierte en trazas auditables y navegables — la "caja negra" del trabajo agéntico. Como un `git log`, pero de lo que hacen los agentes.

**Problema raíz que ataca**: no hay observabilidad de lo que hacen los agentes de código. Sin ella no se puede verificar su trabajo, medir sus costes, alimentar memoria entre sesiones ni coordinar múltiples agentes.

**Objetivo del proyecto**: open source con impacto — adopción y utilidad real, sin modelo de negocio.

**Audiencia**: desarrolladores que usan agentes de código (Claude Code en el MVP).

## Alcance del MVP

### Dentro

- **Fuente única: Claude Code**, con doble captura:
  1. **Hooks** (`PreToolUse`, `PostToolUse`, `SessionStart`, `Stop`) → eventos en tiempo real: herramienta invocada, input, resultado, timestamp.
  2. **Transcripts** (`~/.claude/projects/*.jsonl`) → tokens por mensaje (input/output/cache), modelo, subagentes. Se parsean post-hoc; no requieren acción del usuario.
- **Qué se graba por sesión**: herramientas llamadas, archivos leídos/modificados, comandos bash, tokens por paso, subagentes lanzados, duración, modelo(s).
- **Qué se produce**:
  - Timeline navegable por sesión (CLI y UI web local).
  - Resumen por sesión: archivos tocados, comandos, tokens, subagentes.
  - Panel "claims vs. reality" v1: archivos mencionados por el agente en sus respuestas vs. archivos realmente editados por sus herramientas, con discrepancias marcadas.

### Fuera (pero el diseño lo deja preparado)

- Otros agentes (Cursor, Codex CLI, opencode) — la ingesta es un sistema de adaptadores; solo se implementa el de Claude Code.
- Features de equipo/cloud, streaming en vivo, scoring automático de calidad.

### Principio innegociable

100% local, cero telemetría. Los datos de sesión son código sensible.

## Arquitectura

**Stack**: TypeScript/Node (distribución vía `npx flightbox`). Almacén: SQLite en `~/.flightbox/db.sqlite`.

```
Collector (hooks CC)      Transcript Reader (~/.claude/*.jsonl)
        │                          │
        ▼                          ▼
   Ingester (adaptador claude-code) → normaliza a ATF
        │
        ▼
   Store (SQLite: sessions, events, file_touches, token_usage)
        │
        ▼
   Viewers (CLI: list/show/stats · UI web local: timeline)
```

### Componentes

1. **Collector** — script registrado por `flightbox install` en `~/.claude/settings.json`. Recibe el JSON del hook por stdin y solo hace *append* a un log crudo JSONL. Regla de oro: rápido, no bloqueante; si falla, falla en silencio (exit 0 siempre). Jamás rompe la sesión del agente.
2. **Transcript Reader** — lee transcripts en frío (al consultar), extrae tokens/modelo/subagentes y correlaciona con eventos de hooks por session ID.
3. **Ingester** — único escritor de SQLite. Normaliza ambas fuentes al **Agent Trace Format (ATF)**: esquema común de eventos (`tool_call`, `file_touch`, `command`, `subagent_spawn`, `token_usage`, …). El ATF es la interfaz de adaptadores: soportar otro agente = escribir otro ingester; nada más cambia. Idempotente: re-ingestar es seguro.
4. **Store** — SQLite, esquema mínimo: `sessions`, `events`, `file_touches`, `token_usage`.
5. **Viewers** — consumidores de solo lectura: CLI y UI web local.

### Decisión clave

Capturar crudo primero (log append-only), normalizar después. Un bug de esquema nunca pierde datos: se corrige y se re-ingesta.

### Manejo de errores

- Collector nunca lanza (exit 0 incondicional).
- Ingester idempotente.
- UI degrada con datos parciales: sesión sin transcript → timeline solo de hooks con aviso; transcript sin hooks (sesiones antiguas) → se ingesta igual. Nunca pantalla vacía si hay algún dato.

## Experiencia de usuario

### CLI

```
flightbox install     # registra hooks en ~/.claude/settings.json
flightbox list        # últimas sesiones: fecha, proyecto, duración, tokens, nº archivos
flightbox show <id>   # timeline de una sesión en terminal (subagentes indentados)
flightbox stats       # agregados: tokens/día, por proyecto, por herramienta
flightbox ui          # abre la UI web local
```

### UI web (localhost, sin auth)

Vista de sesión en tres zonas:

1. **Cabecera-resumen** — duración, tokens (desglose input/output/cache), archivos tocados, comandos, subagentes, modelo(s).
2. **Timeline** — feed cronológico colapsable, filtrable por tipo (herramientas/archivos/comandos/subagentes), buscable por texto o ruta. Trazas de subagentes anidadas bajo el evento que los lanzó.
3. **Claims vs. reality** — v1: archivos mencionados vs. editados, discrepancias marcadas.

**Implementación**: servidor Node mínimo (SQLite → API JSON) + SPA Vite/React.

### Onboarding

Como el Transcript Reader lee los transcripts ya existentes, `flightbox install && flightbox list` muestra el historial pasado al instante — valor inmediato sin esperar a nuevas sesiones.

## Testing

- **Ingester (máxima cobertura)** — unitarios con fixtures reales anonimizados (payloads de hooks + transcripts JSONL). Golden tests: fixture entra → filas SQLite esperadas.
- **Collector (contrato)** — con input malformado, vacío o gigante: siempre exit 0, nunca corrompe el log. Es lo único que corre dentro de la sesión del usuario.
- **Integración** — sesión fixture completa → ingest → snapshots de `list`/`show`.
- **UI** — tests de componente de la timeline con fixtures. Sin e2e pesado en MVP.

## Criterio de éxito del MVP

- Instalable en menos de 1 minuto.
- Valor visible en el primer `flightbox list` (backfill de transcripts).
- Cero incidencias del tipo "flightbox me rompió una sesión".

## Roadmap post-MVP (orientativo, fuera de alcance)

1. Adaptadores para otros agentes (Codex CLI, Cursor, opencode) — validan que ATF es agnóstico.
2. Claims-vs-reality v2: correlación con tests ejecutados, verificación a nivel de diff.
3. Export de sesión → memoria (resumen markdown para CLAUDE.md o similar).
4. Publicar ATF como spec independiente — jugada de estándar abierto.

## Riesgos

- **Vendors construyen esto nativo** (Anthropic incluida). Mitigación: ser tool-agnostic vía ATF es exactamente lo que un vendor no hará.
- **Formato de transcripts de Claude Code cambia sin aviso** (no es API pública). Mitigación: captura cruda + ingest idempotente permiten adaptar el parser y re-ingestar sin pérdida; los hooks son interfaz estable documentada.

## Nota de idioma

Este spec es documento de trabajo interno (español). Los artefactos públicos del proyecto (README, docs, ATF spec) se escribirán en inglés.
