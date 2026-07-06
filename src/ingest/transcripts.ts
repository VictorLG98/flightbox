import { classifyTool, makeUniqKey } from '../atf.js';
import type { AtfEvent, SessionPatch, TokenUsageInput, FileTouchInput } from '../atf.js';

export interface TranscriptNorm {
  usage?: TokenUsageInput;
  events: AtfEvent[];
  touches: FileTouchInput[];
  session?: SessionPatch;
}

export function normalizeTranscriptLine(line: string): TranscriptNorm | null {
  let obj: any;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  const sessionId: unknown = obj?.sessionId;
  const ts: unknown = obj?.timestamp;
  if (typeof sessionId !== 'string' || typeof ts !== 'string') return null;

  const session: SessionPatch = { id: sessionId, startedAt: ts, endedAt: ts };
  if (typeof obj.cwd === 'string') session.projectDir = obj.cwd;

  const out: TranscriptNorm = { events: [], touches: [], session };
  if (obj.type !== 'assistant' || !obj.message) return out;

  const msg = obj.message;
  if (typeof msg.model === 'string') session.model = msg.model;

  if (msg.usage && typeof obj.uuid === 'string') {
    out.usage = {
      sessionId,
      messageUuid: obj.uuid,
      model: typeof msg.model === 'string' ? msg.model : null,
      ts,
      inputTokens: msg.usage.input_tokens ?? 0,
      outputTokens: msg.usage.output_tokens ?? 0,
      cacheReadTokens: msg.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: msg.usage.cache_creation_input_tokens ?? 0,
    };
  }

  const content = Array.isArray(msg.content) ? msg.content : [];
  content.forEach((block: any, i: number) => {
    if (block?.type !== 'tool_use' || typeof block.name !== 'string') return;
    const c = classifyTool(block.name, block.input);
    out.events.push({
      sessionId,
      ts,
      type: c.type,
      toolName: block.name,
      detail: c.detail,
      source: 'transcript',
      sidechain: !!obj.isSidechain,
      uniqKey: makeUniqKey('transcript', String(obj.uuid ?? ts), String(i), block.name),
    });
    if (c.touch) {
      out.touches.push({
        sessionId, path: c.touch.path, action: c.touch.action, ts,
        uniqKey: makeUniqKey('transcript-touch', String(obj.uuid ?? ts), String(i), block.name),
      });
    }
  });

  return out;
}
