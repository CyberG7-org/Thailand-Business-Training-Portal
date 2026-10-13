import { describe, expect, it } from 'vitest';
import { interviewErrorDiagnostic } from '@/lib/domain/interview/diagnostic';

describe('interviewErrorDiagnostic', () => {
  it('reports a Gemini HTTP status without logging the error message', () => {
    const error = new Error('Gemini interview request failed (429)');
    expect(interviewErrorDiagnostic(error)).toEqual({ type: 'Error', geminiStatus: 429 });
  });

  it('reports safe database codes and statuses without logging sensitive fields', () => {
    const error = Object.assign(new Error('API key and learner answer are private'), {
      code: 'PGRST205',
      status: 404,
      details: 'Company information is private',
    });
    expect(interviewErrorDiagnostic(error)).toEqual({
      type: 'Error',
      code: 'PGRST205',
      status: 404,
    });
  });

  it('drops unsafe code and status values', () => {
    const error = Object.assign(new Error('secret'), {
      code: 'secret=abc@example.com',
      status: 123456,
    });
    expect(interviewErrorDiagnostic(error)).toEqual({ type: 'Error' });
  });
});
