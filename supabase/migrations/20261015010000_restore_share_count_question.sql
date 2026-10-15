-- Restore a share-count MCQ when a poster states the learner's number of shares.
-- The two percentage variants remain approved as fallback for older records without counts.
-- Existing attempt snapshots are untouched, and the approved question ID is retained.
begin;

update public.questions
set option_recipes = '{"A":"COMPOSITE_TEMPLATE","B":"COMPOSITE_TEMPLATE","C":"COMPOSITE_TEMPLATE","D":"STATIC"}'::jsonb
where question_key = 'mcq-v2-learner-shareholding-1';

with wording(language, prompt, unit, unknown_answer, explanation) as (
  values
    ('th', 'คุณถือหุ้นในบริษัทกี่หุ้น', 'หุ้น', 'ไม่จำเป็นต้องรู้จำนวนหุ้นของตนเอง', 'ตรวจจากบัญชีรายชื่อผู้ถือหุ้น: คุณถือ {my_shares} หุ้น'),
    ('en', 'How many shares do you have?', 'shares', 'I do not need to know my share count', 'Check the shareholder list: you have {my_shares} shares.'),
    ('zh', '您在公司持有多少股？', '股', '我不需要知道自己的持股数', '请查看股东名册：您持有 {my_shares} 股。')
)
update public.question_localizations as localization
set prompt = wording.prompt,
    options = jsonb_build_array(
      jsonb_build_object('key', 'A', 'text', '{my_shares} ' || wording.unit),
      jsonb_build_object('key', 'B', 'text', '{my_shares|numeric(+1)} ' || wording.unit),
      jsonb_build_object('key', 'C', 'text', '{my_shares|numeric(+2)} ' || wording.unit),
      jsonb_build_object('key', 'D', 'text', wording.unknown_answer)
    ),
    explanation = wording.explanation
from public.questions as question, wording
where localization.question_id = question.id
  and localization.language = wording.language
  and question.question_key = 'mcq-v2-learner-shareholding-1';

update public.questions
set approval_status = 'approved'
where question_key = 'mcq-v2-learner-shareholding-1';

commit;
