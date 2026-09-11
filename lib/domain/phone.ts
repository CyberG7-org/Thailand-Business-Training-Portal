/** Thai mobile numbers: 0[6-9] + 8 digits, or +66 / 66 followed by [6-9] + 8 digits. */
const LOCAL = /^0[689]\d{8}$/;
const INTL = /^(?:\+?66)([689]\d{8})$/;

/** Returns the normalized local form `0XXXXXXXXX`, or null when the input is not a Thai mobile. */
export function normalizeThaiMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  if (LOCAL.test(digits)) return digits;
  const m = INTL.exec(digits);
  return m ? `0${m[1]}` : null;
}

/** `0812345678` → `081-234-5678` */
export function formatThaiMobile(normalized: string): string {
  return `${normalized.slice(0, 3)}-${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}
