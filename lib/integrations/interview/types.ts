import { z } from 'zod';
import type {
  FactSheet,
  InterviewPlan,
  OfficerTurn,
  SessionVerdict,
  Turn,
} from '@/lib/domain/interview/types';

export type InterviewProviderName = 'claude' | 'fake' | 'off';

export type TurnInput = {
  facts: FactSheet;
  plan: InterviewPlan;
  /** The turns so far, ending with the officer's last question; empty on the opening turn. */
  transcript: Turn[];
  /** Null on the opening turn: the officer greets and asks the first item. */
  learnerMessage: string | null;
  pastedDetected: boolean;
  /** Evasive answers so far; the third closes the interview. */
  evasions: number;
};

export type NarrateInput = {
  facts: FactSheet;
  verdict: Omit<SessionVerdict, 'narrative'>;
  transcript: Turn[];
};

export interface InterviewProvider {
  readonly name: 'claude' | 'fake';
  turn(input: TurnInput): Promise<OfficerTurn>;
  narrate(input: NarrateInput): Promise<string>;
}

/** The officer_turn shape the model must return (spec §4.3). */
export const officerTurnSchema = z.object({
  say: z.string().min(1).max(600),
  assessment: z
    .object({
      concept: z.string(),
      verdict: z.enum(['correct', 'partial', 'wrong', 'evasive', 'pasted', 'off_topic']),
      note: z.string().max(300),
    })
    .nullable(),
  next: z.union([
    z.object({ concept: z.string() }),
    z.object({
      close: z.enum([
        'plan_complete',
        'too_many_evasions',
        'off_topic_limit',
        'learner_ended',
        'turn_limit',
      ]),
    }),
  ]),
});
