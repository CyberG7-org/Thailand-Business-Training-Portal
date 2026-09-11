import type { Director } from '@/lib/domain/dbd-record';

export type CallCompanyFacts = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  registered_capital: number | string | null;
  head_office_address: string | null;
  directors: Director[] | null;
};

export type VapiEnv = {
  VAPI_TRANSCRIBER_PROVIDER?: string;
  VAPI_TRANSCRIBER_MODEL?: string;
  VAPI_TRANSCRIBER_LANGUAGE?: string;
  VAPI_VOICE_PROVIDER?: string;
  VAPI_VOICE_ID?: string;
  VAPI_VOICE_MODEL?: string;
  VAPI_LLM_PROVIDER?: string;
  VAPI_LLM_MODEL?: string;
};

/**
 * Placeholder Thai bank-officer script (open decision #14 — the owner replaces this).
 * Vapi substitutes {{variables}} from assistantOverrides.variableValues.
 */
export const PLACEHOLDER_BANK_OFFICER_SCRIPT = `คุณคือเจ้าหน้าที่ธนาคารฝ่ายเปิดบัญชีนิติบุคคล กำลังโทรศัพท์เพื่อยืนยันตัวตนของกรรมการบริษัท "{{company_name_th}}" พูดภาษาไทยเท่านั้น สุภาพ ชัดเจน กระชับ ถามทีละคำถามและรอคำตอบก่อนถามข้อถัดไป

ข้อมูลอ้างอิงของบริษัท (ห้ามอ่านให้ผู้ใช้ฟังโดยตรง ใช้เพื่อตรวจสอบคำตอบเท่านั้น):
- ชื่อบริษัท: {{company_name_th}}
- เลขทะเบียนนิติบุคคล: {{juristic_id}}
- ทุนจดทะเบียน: {{registered_capital}} บาท
- ที่ตั้งสำนักงานใหญ่: {{head_office_address}}
- กรรมการ: {{directors}}

ลำดับการสนทนา:
1. ทักทาย แนะนำตัวว่าเป็นเจ้าหน้าที่ธนาคาร และขอยืนยันข้อมูลบริษัทเพื่อดำเนินการเปิดบัญชี
2. ถามชื่อบริษัทที่ต้องการเปิดบัญชี
3. ถามว่าบริษัทประกอบธุรกิจอะไร
4. ถามที่ตั้งสำนักงานใหญ่
5. ถามว่าใครเป็นกรรมการผู้มีอำนาจ
6. ถามทุนจดทะเบียน
7. หากคำตอบไม่ตรงกับข้อมูลอ้างอิง ให้ถามซ้ำอย่างสุภาพหนึ่งครั้ง แต่ห้ามบอกคำตอบที่ถูกต้อง
8. ปิดการสนทนาด้วยการขอบคุณ และแจ้งว่าธนาคารจะดำเนินการต่อไป

ห้ามให้คำแนะนำทางกฎหมายหรือการเงิน ห้ามพูดภาษาอื่นนอกจากภาษาไทย`;

export const PLACEHOLDER_FIRST_MESSAGE =
  'สวัสดีค่ะ ดิฉันโทรจากธนาคาร ขออนุญาตยืนยันข้อมูลบริษัทเพื่อดำเนินการเปิดบัญชีนะคะ ไม่ทราบว่าคุณเป็นกรรมการของบริษัทอะไรคะ';

export function companyVariables(facts: CallCompanyFacts): Record<string, string> {
  return {
    company_name_th: facts.company_name_th ?? '-',
    company_name_en: facts.company_name_en ?? '-',
    juristic_id: facts.juristic_id ?? '-',
    registered_capital:
      facts.registered_capital == null
        ? '-'
        : Number(facts.registered_capital).toLocaleString('th-TH'),
    head_office_address: facts.head_office_address ?? '-',
    directors: facts.directors?.map((d) => d.name_th).join(', ') || '-',
  };
}

export type WebCallConfig = {
  publicKey: string;
  /** Transient assistant passed to `vapi.start(assistant, overrides)`. */
  assistant: Record<string, unknown>;
  overrides: { variableValues: Record<string, string>; metadata: Record<string, string> };
};

/** Builds the transient Thai assistant; the webhook secret travels as a custom header. */
export function buildWebCallConfig(args: {
  publicKey: string;
  sessionId: string;
  facts: CallCompanyFacts;
  webhookUrl: string | null;
  webhookSecret: string | null;
  env?: VapiEnv;
  script?: string;
  firstMessage?: string;
}): WebCallConfig {
  const env = args.env ?? {};
  const variableValues = { ...companyVariables(args.facts), session_id: args.sessionId };
  const assistant: Record<string, unknown> = {
    name: 'Thai bank verification trainer',
    firstMessage: args.firstMessage ?? PLACEHOLDER_FIRST_MESSAGE,
    transcriber: {
      provider: env.VAPI_TRANSCRIBER_PROVIDER ?? 'deepgram',
      model: env.VAPI_TRANSCRIBER_MODEL ?? 'nova-2',
      language: env.VAPI_TRANSCRIBER_LANGUAGE ?? 'th',
    },
    model: {
      provider: env.VAPI_LLM_PROVIDER ?? 'openai',
      model: env.VAPI_LLM_MODEL ?? 'gpt-4o',
      messages: [{ role: 'system', content: args.script ?? PLACEHOLDER_BANK_OFFICER_SCRIPT }],
    },
    voice: {
      provider: env.VAPI_VOICE_PROVIDER ?? '11labs',
      voiceId: env.VAPI_VOICE_ID ?? 'sarah',
      ...(env.VAPI_VOICE_MODEL
        ? { model: env.VAPI_VOICE_MODEL }
        : { model: 'eleven_multilingual_v2' }),
    },
    serverMessages: ['status-update', 'end-of-call-report'],
    metadata: { session_id: args.sessionId },
    maxDurationSeconds: 900,
    artifactPlan: { recordingEnabled: true },
  };
  if (args.webhookUrl) {
    assistant.server = {
      url: args.webhookUrl,
      ...(args.webhookSecret ? { headers: { 'x-vapi-secret': args.webhookSecret } } : {}),
    };
  }
  return {
    publicKey: args.publicKey,
    assistant,
    overrides: { variableValues, metadata: { session_id: args.sessionId } },
  };
}
