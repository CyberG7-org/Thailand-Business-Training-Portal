/** The record page's tabs, shared by the server page (which picks the first) and the tab bar. */
export const RECORD_TABS = ['details', 'interview', 'documents', 'exceptions'] as const;
export type RecordTab = (typeof RECORD_TABS)[number];

export const isRecordTab = (value: unknown): value is RecordTab =>
  RECORD_TABS.includes(value as RecordTab);
