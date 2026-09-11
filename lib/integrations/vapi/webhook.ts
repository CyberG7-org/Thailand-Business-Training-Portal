/** Parsed view of the Vapi server messages we act on (status-update, end-of-call-report). */
export type ParsedVapiMessage = {
  type: string;
  callId: string | null;
  sessionId: string | null;
  status: string | null;
  endedReason: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  /** A stable id for the ledger: call id + type (+ status for status updates). */
  externalId: string;
};

type Json = Record<string, unknown>;

function obj(v: unknown): Json | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function transcriptFromMessages(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  const lines = messages
    .map((m) => obj(m))
    .filter(
      (m): m is Json => m !== null && typeof m.message === 'string' && typeof m.role === 'string',
    )
    .filter((m) => m.role === 'user' || m.role === 'bot' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'ผู้เรียน' : 'เจ้าหน้าที่'}: ${m.message}`);
  return lines.length ? lines.join('\n') : null;
}

/** Tolerant of the several places Vapi has put the same fields over time. */
export function parseVapiMessage(body: unknown): ParsedVapiMessage | null {
  const root = obj(body);
  const message = obj(root?.message) ?? root;
  if (!message) return null;
  const type = str(message.type);
  if (!type) return null;

  const call = obj(message.call);
  const callId = str(call?.id) ?? str(message.callId);
  const artifact = obj(message.artifact) ?? obj(call?.artifact);
  const overrides = obj(call?.assistantOverrides);
  const variableValues = obj(overrides?.variableValues);
  const metadata = obj(call?.metadata) ?? obj(obj(call?.assistant)?.metadata);
  const sessionId = str(variableValues?.session_id) ?? str(metadata?.session_id);
  const status = str(message.status) ?? str(call?.status);
  const recording = obj(artifact?.recording);
  const recordingUrl =
    str(artifact?.recordingUrl) ??
    str(recording?.mono ? obj(recording.mono)?.combinedUrl : null) ??
    str(recording?.combinedUrl) ??
    str(message.recordingUrl);
  const transcript =
    str(artifact?.transcript) ??
    str(message.transcript) ??
    transcriptFromMessages(artifact?.messages ?? message.messages);

  return {
    type,
    callId,
    sessionId,
    status,
    endedReason: str(message.endedReason),
    transcript,
    recordingUrl,
    externalId: `${callId ?? sessionId ?? 'unknown'}:${type}${status ? `:${status}` : ''}`,
  };
}
