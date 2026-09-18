import type { Director } from '@/lib/domain/dbd-record';

export type CallCompanyFacts = {
  company_name_th: string | null;
  company_name_en: string | null;
  juristic_id: string | null;
  registered_capital: number | string | null;
  head_office_address: string | null;
  directors: Director[] | null;
  /** Bank-interview concepts (decision D39); all optional — missing facts render as "-". */
  registered_on?: string | null;
  province?: string | null;
  business_categories?: string[] | null;
  total_shares?: number | null;
  shareholders_count?: number | null;
  account_purpose?: string | null;
  monthly_volume?: string | null;
  clients_location?: string | null;
  suppliers_location?: string | null;
  source_of_funds?: string | null;
  business_address?: string | null;
  operations_status?: string | null;
  my_name?: string | null;
  my_position?: string | null;
  my_responsibilities?: string | null;
  my_relationship?: string | null;
  my_shares?: number | null;
  my_share_percent?: number | null;
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
 * Thai bank-officer script built on the bank's account-opening question list supplied by the
 * owner's lawyers (decision D39). Vapi substitutes {{variables}} from assistantOverrides.variableValues.
 */
export const BANK_OFFICER_SCRIPT = `คุณคือเจ้าหน้าที่ธนาคารฝ่ายเปิดบัญชีนิติบุคคล กำลังโทรศัพท์สัมภาษณ์ "{{my_name}}" กรรมการ/ผู้ถือหุ้นของบริษัท "{{company_name_th}}" ก่อนอนุมัติการเปิดบัญชี พูดภาษาไทยเท่านั้น สุภาพ ชัดเจน กระชับ ถามทีละคำถามและรอคำตอบก่อนถามข้อถัดไป ใช้คำพูดของตัวเองได้ ไม่ต้องถามตามลำดับเป๊ะ แต่ต้องครอบคลุมทุกหัวข้อ

ข้อมูลอ้างอิง (ห้ามอ่านให้ผู้ใช้ฟัง ใช้เพื่อตรวจสอบคำตอบเท่านั้น):
- ชื่อบริษัท: {{company_name_th}} ({{company_name_en}})
- เลขทะเบียนนิติบุคคล: {{juristic_id}} จดทะเบียนเมื่อ: {{registered_on}}
- กรรมการ: {{directors}}
- ที่อยู่จดทะเบียน: {{head_office_address}} จังหวัด{{province}}
- ธุรกิจหลัก: {{business_categories}}
- ทุนจดทะเบียน: {{registered_capital}} บาท หุ้นทั้งหมด: {{total_shares}} หุ้น ผู้ถือหุ้น: {{shareholders_count}} คน
- ผู้ถูกสัมภาษณ์: {{my_name}} ตำแหน่ง {{my_position}} ถือหุ้น {{my_shares}} หุ้น ({{my_share_percent}}%) หน้าที่: {{my_responsibilities}} ความสัมพันธ์กับผู้ถือหุ้นคนอื่น: {{my_relationship}}
- วัตถุประสงค์การเปิดบัญชี: {{account_purpose}} เงินเข้าออกต่อเดือน: {{monthly_volume}}
- ลูกค้าหลัก: {{clients_location}} ซัพพลายเออร์หลัก: {{suppliers_location}} แหล่งเงินทุน: {{source_of_funds}}
- ที่ประกอบธุรกิจจริง: {{business_address}} สถานะการดำเนินงาน: {{operations_status}}

หัวข้อที่ต้องถาม (ครบทั้ง 16 ข้อ):
1. บริษัทชื่ออะไร
2. บริษัทจดทะเบียนจัดตั้งเมื่อใด
3. บริษัทมีกรรมการกี่คน
4. บริษัทจดทะเบียนที่ไหน ที่อยู่จดทะเบียนคือที่ใด
5. บริษัทประกอบธุรกิจหลักอะไร
6. บริษัทมีผู้ถือหุ้นกี่คน
7. คุณถือหุ้นกี่หุ้น คิดเป็นสัดส่วนเท่าใด
8. ทุนจดทะเบียนเท่าใด มีหุ้นทั้งหมดกี่หุ้น
9. คุณรู้จักผู้ถือหุ้นคนอื่นหรือไม่ มีความสัมพันธ์กันอย่างไร
10. บริษัทต้องการเปิดบัญชีเพื่ออะไร
11. คาดว่าจะมีเงินเข้าออกต่อเดือนประมาณเท่าใด
12. ลูกค้าหลักและซัพพลายเออร์หลักอยู่ที่ไหน
13. แหล่งที่มาของเงินทุนคืออะไร
14. คุณดำรงตำแหน่งอะไร รับผิดชอบงานด้านใด
15. สถานที่ประกอบธุรกิจจริงอยู่ที่ไหน
16. บริษัทเริ่มดำเนินธุรกิจแล้วหรือยัง

วิธีดำเนินการ:
- เริ่มด้วยการทักทาย แนะนำตัวว่าเป็นเจ้าหน้าที่ธนาคาร และแจ้งว่าจะขอสอบถามข้อมูลเพื่อประกอบการเปิดบัญชี
- หากคำตอบไม่ตรงกับข้อมูลอ้างอิง ให้ถามซ้ำอย่างสุภาพหนึ่งครั้ง แต่ห้ามบอกคำตอบที่ถูกต้อง
- หากข้อมูลอ้างอิงข้อใดเป็น "-" ให้ถามตามปกติและรับฟังคำตอบโดยไม่ตัดสิน
- ปิดการสนทนาด้วยการขอบคุณ และแจ้งว่าธนาคารจะดำเนินการต่อไป

ห้ามให้คำแนะนำทางกฎหมายหรือการเงิน ห้ามพูดภาษาอื่นนอกจากภาษาไทย`;

/** @deprecated kept for older imports; the script is now the bank's question list. */
export const PLACEHOLDER_BANK_OFFICER_SCRIPT = BANK_OFFICER_SCRIPT;

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
    registered_on: facts.registered_on ?? '-',
    province: facts.province ?? '-',
    business_categories: facts.business_categories?.join(', ') || '-',
    total_shares: facts.total_shares == null ? '-' : facts.total_shares.toLocaleString('th-TH'),
    shareholders_count: facts.shareholders_count == null ? '-' : String(facts.shareholders_count),
    account_purpose: facts.account_purpose ?? '-',
    monthly_volume: facts.monthly_volume ?? '-',
    clients_location: facts.clients_location ?? '-',
    suppliers_location: facts.suppliers_location ?? '-',
    source_of_funds: facts.source_of_funds ?? '-',
    business_address: facts.business_address ?? '-',
    operations_status: facts.operations_status ?? '-',
    my_name: facts.my_name ?? '-',
    my_position: facts.my_position ?? '-',
    my_responsibilities: facts.my_responsibilities ?? '-',
    my_relationship: facts.my_relationship ?? '-',
    my_shares: facts.my_shares == null ? '-' : facts.my_shares.toLocaleString('th-TH'),
    my_share_percent: facts.my_share_percent == null ? '-' : String(facts.my_share_percent),
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
      messages: [{ role: 'system', content: args.script ?? BANK_OFFICER_SCRIPT }],
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
