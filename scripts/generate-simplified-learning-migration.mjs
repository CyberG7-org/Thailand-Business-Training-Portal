import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MCQ_STARTER } from '../lib/content/mcq-starter.ts';

const destination = resolve('supabase/migrations/20261008010000_simplified_learning_flow.sql');
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${sqlString(JSON.stringify(value))}::jsonb`;

const questionRows = MCQ_STARTER.map(
  (variant) =>
    `(${sqlString(variant.key)}, ${sqlString(variant.conceptKey)}, ${sqlString(variant.correctKey)}, ${json(variant.optionRecipes)}, ${variant.appliesWhen ? json(variant.appliesWhen) : 'null'})`,
).join(',\n  ');

const localizationRows = MCQ_STARTER.flatMap((variant) =>
  ['th', 'en', 'zh'].map((language) => {
    const text = variant.texts[language];
    if (!text) throw new Error(`Missing ${language} text for ${variant.key}`);
    const options = ['A', 'B', 'C', 'D'].map((key) => ({ key, text: text.options[key] }));
    return `(${sqlString(variant.key)}, ${sqlString(language)}, ${sqlString(text.prompt)}, ${json(options)}, ${sqlString(variant.correctKey)}, ${text.explanation ? sqlString(text.explanation) : 'null'})`;
  }),
).join(',\n  ');

const output = `-- Simplified learner flow v2: 30 concepts × 3 plain-language quiz variants.
-- This migration is additive. Historic questions and attempts are retained; only old approved
-- concept variants are retired after the v2 rows have been written and approved.
--
-- Rollback (content only):
--   update public.questions set approval_status = 'retired'
--     where question_key like 'mcq-v2-%';
--   update public.questions set approval_status = 'approved'
--     where concept_key is not null and question_key not like 'mcq-v2-%';
-- Existing attempts remain valid because rendered questions and rule snapshots are frozen.

create temporary table simplified_quiz_questions (
  question_key text primary key,
  concept_key text not null,
  correct_key text not null,
  option_recipes jsonb not null,
  applies_when jsonb
) on commit drop;

insert into simplified_quiz_questions
  (question_key, concept_key, correct_key, option_recipes, applies_when)
values
  ${questionRows};

insert into public.questions (
  question_key, kind, concept_key, pools, approval_status,
  correct_option_key, option_recipes, applies_when
)
select question_key, 'concept', concept_key, '{}', 'draft',
       correct_key, option_recipes, applies_when
from simplified_quiz_questions
on conflict (question_key) do update set
  kind = excluded.kind,
  concept_key = excluded.concept_key,
  pools = excluded.pools,
  approval_status = 'draft',
  correct_option_key = excluded.correct_option_key,
  option_recipes = excluded.option_recipes,
  applies_when = excluded.applies_when;

create temporary table simplified_quiz_localizations (
  question_key text not null,
  language text not null,
  prompt text not null,
  options jsonb not null,
  correct_key text not null,
  explanation text
) on commit drop;

insert into simplified_quiz_localizations
  (question_key, language, prompt, options, correct_key, explanation)
values
  ${localizationRows};

insert into public.question_localizations (
  question_id, language, prompt, options, correct_key, explanation, tts_enabled
)
select q.id, l.language, l.prompt, l.options, l.correct_key, l.explanation, false
from simplified_quiz_localizations l
join public.questions q on q.question_key = l.question_key
on conflict (question_id, language) do update set
  prompt = excluded.prompt,
  options = excluded.options,
  correct_key = excluded.correct_key,
  explanation = excluded.explanation,
  tts_enabled = excluded.tts_enabled;

-- Approval happens after Thai/English/Chinese rows exist, satisfying the approval trigger.
update public.questions
set approval_status = 'approved'
where question_key like 'mcq-v2-%';

-- Keep history and foreign keys intact while removing old wording from future attempts.
update public.questions
set approval_status = 'retired'
where concept_key is not null
  and question_key not like 'mcq-v2-%'
  and approval_status = 'approved';
`;

writeFileSync(destination, output);
console.log(`wrote ${destination} with ${MCQ_STARTER.length} variants`);
