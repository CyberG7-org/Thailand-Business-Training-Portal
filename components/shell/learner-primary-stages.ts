import type { StageKey } from '@/lib/domain/progression';

export const PRIMARY_LEARNER_STAGES = ['study', 'exam', 'interview', 'nameCard'] as const;
export type PrimaryLearnerStage = (typeof PRIMARY_LEARNER_STAGES)[number];

export function isPrimaryStage(stage: StageKey | undefined): stage is PrimaryLearnerStage {
  return stage !== undefined && PRIMARY_LEARNER_STAGES.includes(stage as PrimaryLearnerStage);
}
