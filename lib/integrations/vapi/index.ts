export type VapiProviderName = 'vapi' | 'fake' | 'off';

/**
 * VAPI_PROVIDER=vapi|fake|off. Default: vapi when VAPI_PUBLIC_KEY is set, otherwise fake
 * outside production and off in production.
 */
export function resolveVapiProvider(
  env: Record<string, string | undefined> = process.env,
): VapiProviderName {
  const configured = env.VAPI_PROVIDER;
  if (configured === 'vapi' || configured === 'fake' || configured === 'off') return configured;
  if (env.VAPI_PUBLIC_KEY) return 'vapi';
  return env.NODE_ENV === 'production' ? 'off' : 'fake';
}

export const FAKE_TRANSCRIPT = `เจ้าหน้าที่: สวัสดีค่ะ ดิฉันโทรจากธนาคาร ขอยืนยันข้อมูลบริษัทนะคะ ไม่ทราบว่าคุณเป็นกรรมการของบริษัทอะไรคะ
ผู้เรียน: บริษัท {{company_name_th}} ครับ
เจ้าหน้าที่: บริษัทประกอบธุรกิจอะไรคะ
ผู้เรียน: ธุรกิจตามวัตถุประสงค์ที่จดทะเบียนครับ
เจ้าหน้าที่: สำนักงานใหญ่ตั้งอยู่ที่ไหนคะ
ผู้เรียน: {{head_office_address}} ครับ
เจ้าหน้าที่: ทุนจดทะเบียนเท่าไรคะ
ผู้เรียน: {{registered_capital}} บาทครับ
เจ้าหน้าที่: ขอบคุณค่ะ ธนาคารจะดำเนินการต่อไปนะคะ`;
