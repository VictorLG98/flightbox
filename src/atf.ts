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
