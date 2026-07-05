import { classifyTool, makeUniqKey } from '../atf.js';
import type { AtfEvent, FileTouchInput, SessionPatch } from '../atf.js';

export interface HookNorm {
  events: AtfEvent[];
  touches: FileTouchInput[];
  session?: SessionPatch;
}

export function normalizeHookLine(line: string): HookNorm | null {
  let rec: any;
  try {
    rec = JSON.parse(line);
  } catch {
    return null;
  }
  const p = rec?.payload;
  const sessionId: unknown = p?.session_id;
  const ts: unknown = rec?.received_at;
  if (typeof sessionId !== 'string' || typeof ts !== 'string') return null;

  const base = { sessionId, ts, source: 'hook' as const, sidechain: false };
  const key = (...extra: string[]) => makeUniqKey(ts, sessionId, ...extra);

  switch (p.hook_event_name) {
    case 'SessionStart':
      return {
        events: [{ ...base, type: 'session_start', toolName: null, detail: String(p.cwd ?? ''), uniqKey: key('session_start') }],
        touches: [],
        session: { id: sessionId, ...(p.cwd ? { projectDir: String(p.cwd) } : {}), startedAt: ts },
      };
    case 'Stop':
      return {
        events: [{ ...base, type: 'session_end', toolName: null, detail: '', uniqKey: key('session_end') }],
        touches: [],
        session: { id: sessionId, endedAt: ts },
      };
    case 'PreToolUse': {
      const toolName = String(p.tool_name ?? 'unknown');
      const c = classifyTool(toolName, p.tool_input);
      const uniqKey = key('pre', toolName, JSON.stringify(p.tool_input ?? null));
      const events: AtfEvent[] = [{ ...base, type: c.type, toolName, detail: c.detail, uniqKey }];
      const touches: FileTouchInput[] = c.touch
        ? [{ sessionId, path: c.touch.path, action: c.touch.action, ts, uniqKey: makeUniqKey(uniqKey, 'touch') }]
        : [];
      return { events, touches, session: { id: sessionId } };
    }
    case 'PostToolUse':
      // Raw log keeps the tool response for future use; MVP timeline skips it
      // to avoid duplicating every PreToolUse line.
      return { events: [], touches: [], session: { id: sessionId } };
    default:
      return { events: [], touches: [], session: { id: sessionId } };
  }
}
