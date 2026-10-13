/** Safe, structured details for server logs; never include the error message or company facts. */
export function interviewErrorDiagnostic(error: unknown): {
  type: string;
  code?: string;
  status?: number;
  geminiStatus?: number;
} {
  const knownNames = new Set(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'InterviewError']);
  const type = error instanceof Error && knownNames.has(error.name) ? error.name : typeof error;
  const diagnostic: {
    type: string;
    code?: string;
    status?: number;
    geminiStatus?: number;
  } = { type };

  if (error !== null && typeof error === 'object') {
    const { code, status } = error as { code?: unknown; status?: unknown };
    if (typeof code === 'string' && /^[a-zA-Z0-9_]{1,24}$/.test(code)) diagnostic.code = code;
    if (typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599) {
      diagnostic.status = status;
    }
  }

  if (error instanceof Error) {
    const match = /^Gemini interview request failed \(([1-5]\d\d)\)$/.exec(error.message);
    if (match) diagnostic.geminiStatus = Number(match[1]);
  }

  return diagnostic;
}
