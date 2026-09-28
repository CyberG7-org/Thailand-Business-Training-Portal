import type { StageInfo, StageKey } from '@/lib/domain/progression';

/** One of the steps as the dashboard shows it, resolved once in the page for every part. */
export type StageRow = {
  key: StageKey;
  info: StageInfo;
  title: string;
  shortTitle: string;
  statusLabel: string;
  /** The reason a step is not open, or the appointment window, in the learner's language. */
  detail: string | null;
  /** Null when the step's screens are not open to this learner. */
  href: string | null;
  current: boolean;
};

/** Where each step's screens live; a step without a route shows status only (appointment: P16b). */
export const STAGE_ROUTES: Partial<Record<StageKey, string>> = {
  study: '/study',
  quiz: '/quiz',
  exam: '/exam',
  nameCard: '/name-card',
  interview: '/interview',
};
