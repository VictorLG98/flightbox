import { createHash } from 'node:crypto';

export type AtfEventType =
  | 'session_start'
  | 'session_end'
  | 'tool_call'
  | 'file_touch'
  | 'command'
  | 'subagent_spawn';

export interface AtfEvent {
  sessionId: string;
  ts: string; // ISO 8601
  type: AtfEventType;
  toolName: string | null;
  detail: string;
  source: 'hook' | 'transcript';
  sidechain: boolean;
  uniqKey: string;
}

export interface FileTouchInput {
  sessionId: string;
  path: string;
  action: 'read' | 'edit' | 'write';
  ts: string;
  uniqKey: string;
}

export interface SessionPatch {
  id: string;
  projectDir?: string;
  startedAt?: string;
  endedAt?: string;
  model?: string;
}

export interface TokenUsageInput {
  sessionId: string;
  messageUuid: string;
  model: string | null;
  ts: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export interface ToolOutcomeInput {
  sessionId: string;
  path: string | null;
  toolName: string;
  success: boolean | null;
  rawResponse: string;
  ts: string;
  uniqKey: string;
}

export function makeUniqKey(...parts: string[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex');
}

export interface Classified {
  type: AtfEventType;
  detail: string;
  touch?: { path: string; action: 'read' | 'edit' | 'write' };
}

export function classifyTool(toolName: string, input: unknown): Classified {
  const inp = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case 'Bash':
      return { type: 'command', detail: String(inp.command ?? '') };
    case 'Read':
      return { type: 'file_touch', detail: String(inp.file_path ?? ''), touch: { path: String(inp.file_path ?? ''), action: 'read' } };
    case 'Edit':
    case 'NotebookEdit':
      return { type: 'file_touch', detail: String(inp.file_path ?? inp.notebook_path ?? ''), touch: { path: String(inp.file_path ?? inp.notebook_path ?? ''), action: 'edit' } };
    case 'Write':
      return { type: 'file_touch', detail: String(inp.file_path ?? ''), touch: { path: String(inp.file_path ?? ''), action: 'write' } };
    case 'Task':
    case 'Agent':
      return { type: 'subagent_spawn', detail: String(inp.description ?? String(inp.prompt ?? '').slice(0, 80)) };
    default:
      return { type: 'tool_call', detail: JSON.stringify(inp).slice(0, 120) };
  }
}
