-- Company shareholder records contain names and ownership percentages, not share counts.
-- Keep the existing approved v2 question IDs so prior attempts remain linked to them.
begin;

update public.questions
set option_recipes = '{"A":"DIRECT_FACT","B":"STATIC","C":"STATIC","D":"STATIC"}'::jsonb
where question_key in (
  'mcq-v2-learner-shareholding-1',
  'mcq-v2-learner-shareholding-2',
  'mcq-v2-learner-shareholding-3'
);

with wording(language, prompt_1, prompt_2, prompt_3, wrong_b, wrong_c, wrong_d, explanation) as (
  values
    ('th',
     'คุณเป็นเจ้าของบริษัทคิดเป็นกี่เปอร์เซ็นต์',
     'คุณถือหุ้นคิดเป็นกี่เปอร์เซ็นต์ของบริษัท',
     'สัดส่วนการถือหุ้นของคุณในบริษัทคือเท่าใด',
     'ไม่จำเป็นต้องรู้สัดส่วนการถือหุ้นของตนเอง',
     'ทุนจดทะเบียนคือเปอร์เซ็นต์การถือหุ้นของฉัน',
     'ธนาคารเป็นผู้กำหนดสัดส่วนการถือหุ้นให้',
     'ตรวจจากบัญชีรายชื่อผู้ถือหุ้น: คุณถือหุ้นคิดเป็น {my_share_percent}'),
    ('en',
     'How much of the company do you own, as a percentage?',
     'What percentage of the company do you own?',
     'What is your ownership percentage in the company?',
     'I do not need to know my ownership percentage',
     'The registered capital is my ownership percentage',
     'The bank decides my ownership percentage',
     'Check the shareholder list: your ownership percentage is {my_share_percent}.'),
    ('zh',
     '您持有公司多少百分比的股份？',
     '您拥有公司多少百分比？',
     '您在公司的持股比例是多少？',
     '我不需要知道自己的持股比例',
     '注册资本就是我的持股比例',
     '银行决定我的持股比例',
     '请查看股东名册：您的持股比例是 {my_share_percent}。')
)
update public.question_localizations as localization
set prompt = case right(question.question_key, 1)
      when '1' then wording.prompt_1
      when '2' then wording.prompt_2
      else wording.prompt_3
    end,
    options = jsonb_build_array(
      jsonb_build_object('key', 'A', 'text', '{my_share_percent}'),
      jsonb_build_object('key', 'B', 'text', wording.wrong_b),
      jsonb_build_object('key', 'C', 'text', wording.wrong_c),
      jsonb_build_object('key', 'D', 'text', wording.wrong_d)
    ),
    explanation = wording.explanation
from public.questions as question, wording
where localization.question_id = question.id
  and localization.language = wording.language
  and question.question_key in (
    'mcq-v2-learner-shareholding-1',
    'mcq-v2-learner-shareholding-2',
    'mcq-v2-learner-shareholding-3'
  );

-- Editing Thai text returns an approved question to draft; approve the corrected variants.
update public.questions
set approval_status = 'approved'
where question_key in (
  'mcq-v2-learner-shareholding-1',
  'mcq-v2-learner-shareholding-2',
  'mcq-v2-learner-shareholding-3'
);

commit;
