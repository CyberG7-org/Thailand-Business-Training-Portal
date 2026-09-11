import { describe, expect, it } from 'vitest';
import { buildWebCallConfig, companyVariables } from '@/lib/integrations/vapi/config';
import { resolveVapiProvider } from '@/lib/integrations/vapi/index';
import { parseVapiMessage } from '@/lib/integrations/vapi/webhook';

const facts = {
  company_name_th: 'บริษัท ทดสอบ จำกัด',
  company_name_en: null,
  juristic_id: '0105569000123',
  registered_capital: 2000000,
  head_office_address: '99/9',
  directors: [{ name_th: 'นาย ก', name_en: null }],
};

describe('buildWebCallConfig', () => {
  it('builds a Thai transient assistant with company variables, session id and webhook headers', () => {
    const cfg = buildWebCallConfig({
      publicKey: 'pk',
      sessionId: 's1',
      facts,
      webhookUrl: 'https://app.example/api/webhooks/vapi',
      webhookSecret: 'shh',
    });
    expect(cfg.overrides.variableValues).toMatchObject({
      company_name_th: 'บริษัท ทดสอบ จำกัด',
      registered_capital: '2,000,000',
      directors: 'นาย ก',
      session_id: 's1',
    });
    expect(cfg.assistant.transcriber).toMatchObject({ provider: 'deepgram', language: 'th' });
    expect(cfg.assistant.server).toEqual({
      url: 'https://app.example/api/webhooks/vapi',
      headers: { 'x-vapi-secret': 'shh' },
    });
    expect(
      String((cfg.assistant.model as { messages: { content: string }[] }).messages[0].content),
    ).toContain('{{company_name_th}}');
  });
  it('honours provider overrides from env and omits the server block without a URL', () => {
    const cfg = buildWebCallConfig({
      publicKey: 'pk',
      sessionId: 's1',
      facts,
      webhookUrl: null,
      webhookSecret: null,
      env: {
        VAPI_TRANSCRIBER_PROVIDER: 'azure',
        VAPI_VOICE_PROVIDER: 'azure',
        VAPI_VOICE_ID: 'th-TH-PremwadeeNeural',
      },
    });
    expect(cfg.assistant.transcriber).toMatchObject({ provider: 'azure' });
    expect(cfg.assistant.voice).toMatchObject({
      provider: 'azure',
      voiceId: 'th-TH-PremwadeeNeural',
    });
    expect(cfg.assistant.server).toBeUndefined();
    expect(companyVariables({ ...facts, directors: null }).directors).toBe('-');
  });
});

describe('parseVapiMessage', () => {
  it('reads an end-of-call-report with artifact recording and transcript', () => {
    const parsed = parseVapiMessage({
      message: {
        type: 'end-of-call-report',
        endedReason: 'hangup',
        call: { id: 'call_1', assistantOverrides: { variableValues: { session_id: 's1' } } },
        artifact: {
          transcript: 'AI: สวัสดี\nUser: สวัสดีครับ',
          recording: { mono: { combinedUrl: 'https://r/x.wav' } },
        },
      },
    });
    expect(parsed).toMatchObject({
      type: 'end-of-call-report',
      callId: 'call_1',
      sessionId: 's1',
      endedReason: 'hangup',
      recordingUrl: 'https://r/x.wav',
      externalId: 'call_1:end-of-call-report',
    });
    expect(parsed?.transcript).toContain('สวัสดีครับ');
  });
  it('builds a transcript from messages when no transcript string exists, and reads status updates', () => {
    const report = parseVapiMessage({
      message: {
        type: 'end-of-call-report',
        call: { id: 'c2', metadata: { session_id: 's2' } },
        artifact: {
          messages: [
            { role: 'bot', message: 'ถามหนึ่ง' },
            { role: 'user', message: 'ตอบหนึ่ง' },
            { role: 'system', message: 'ignored' },
          ],
        },
      },
    });
    expect(report?.transcript).toBe('เจ้าหน้าที่: ถามหนึ่ง\nผู้เรียน: ตอบหนึ่ง');
    const status = parseVapiMessage({
      message: { type: 'status-update', status: 'ended', call: { id: 'c2' } },
    });
    expect(status).toMatchObject({
      type: 'status-update',
      status: 'ended',
      externalId: 'c2:status-update:ended',
    });
    expect(parseVapiMessage({ nope: true })).toBeNull();
  });
});

describe('resolveVapiProvider', () => {
  it('follows the standard provider pattern', () => {
    expect(resolveVapiProvider({ VAPI_PUBLIC_KEY: 'pk' })).toBe('vapi');
    expect(resolveVapiProvider({ NODE_ENV: 'development' })).toBe('fake');
    expect(resolveVapiProvider({ NODE_ENV: 'production' })).toBe('off');
    expect(resolveVapiProvider({ VAPI_PROVIDER: 'off', VAPI_PUBLIC_KEY: 'pk' })).toBe('off');
  });
});
