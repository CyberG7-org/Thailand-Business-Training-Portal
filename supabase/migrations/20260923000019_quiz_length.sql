-- The attempt is one scrolling page now (D57), so a longer practice quiz costs no extra
-- clicking: the quiz matches the exam at 20 questions. The owner can still change both in
-- Admin → Policy settings.

update public.policy_config set value = '20'::jsonb where key = 'quiz_question_count';
