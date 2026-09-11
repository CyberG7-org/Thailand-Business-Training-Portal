-- Sample question bank: three generic and three DBD-template questions, approved in all languages.
-- Included from seed.sql. Contains no real data.

insert into public.questions (id, question_key, kind, dbd_field_dependencies, approval_status, pools) values
  ('22222222-2222-4222-8222-222222222201', 'sample-what-is-dbd', 'generic', '{}', 'draft', '{quiz,exam}'),
  ('22222222-2222-4222-8222-222222222202', 'sample-issue-date-rule', 'generic', '{}', 'draft', '{quiz,exam}'),
  ('22222222-2222-4222-8222-222222222203', 'sample-bank-call-purpose', 'generic', '{}', 'draft', '{quiz,exam}'),
  ('22222222-2222-4222-8222-222222222204', 'sample-capital', 'dbd_template', '{registered_capital,company_name_th}', 'draft', '{quiz,exam}'),
  ('22222222-2222-4222-8222-222222222205', 'sample-juristic-id', 'dbd_template', '{juristic_id}', 'draft', '{quiz,exam}'),
  ('22222222-2222-4222-8222-222222222206', 'sample-issued-on', 'dbd_template', '{issued_on}', 'draft', '{quiz,exam}')
on conflict (question_key) do nothing;

insert into public.question_localizations (question_id, language, prompt, options, correct_key, explanation, tts_enabled) values
  ('22222222-2222-4222-8222-222222222201', 'th', 'หนังสือรับรอง (DBD) ออกโดยหน่วยงานใด',
   '[{"key":"A","text":"กรมพัฒนาธุรกิจการค้า"},{"key":"B","text":"กรมสรรพากร"},{"key":"C","text":"ธนาคารแห่งประเทศไทย"},{"key":"D","text":"กระทรวงแรงงาน"}]', 'A', 'หนังสือรับรองบริษัทออกโดยกรมพัฒนาธุรกิจการค้า กระทรวงพาณิชย์', true),
  ('22222222-2222-4222-8222-222222222201', 'en', 'Which agency issues the DBD company certificate?',
   '[{"key":"A","text":"Department of Business Development"},{"key":"B","text":"Revenue Department"},{"key":"C","text":"Bank of Thailand"},{"key":"D","text":"Ministry of Labour"}]', 'A', 'The certificate is issued by the Department of Business Development, Ministry of Commerce.', false),
  ('22222222-2222-4222-8222-222222222201', 'zh', 'DBD 公司证书由哪个机构签发？',
   '[{"key":"A","text":"商业发展厅"},{"key":"B","text":"税务厅"},{"key":"C","text":"泰国银行"},{"key":"D","text":"劳工部"}]', 'A', '公司证书由商务部商业发展厅签发。', false),

  ('22222222-2222-4222-8222-222222222202', 'th', 'การยืนยันตัวตนกับธนาคารเปิดให้ทำได้เมื่อใด',
   '[{"key":"A","text":"ทันทีที่ได้รับหนังสือรับรอง"},{"key":"B","text":"45 วันหลังวันที่ออกหนังสือรับรอง"},{"key":"C","text":"45 วันหลังวันที่จดทะเบียนบริษัท"},{"key":"D","text":"หลังสอบผ่านเท่านั้น ไม่เกี่ยวกับวันที่"}]', 'B', 'กฎคือวันที่ออกหนังสือรับรอง + 45 วันตามปฏิทิน', true),
  ('22222222-2222-4222-8222-222222222202', 'en', 'When does the bank verification stage open?',
   '[{"key":"A","text":"As soon as the certificate is received"},{"key":"B","text":"45 days after the certificate issue date"},{"key":"C","text":"45 days after the company registration date"},{"key":"D","text":"Only after passing the exam, regardless of dates"}]', 'B', 'The rule is the certificate issue date plus 45 calendar days.', false),
  ('22222222-2222-4222-8222-222222222202', 'zh', '银行验证阶段何时开放？',
   '[{"key":"A","text":"收到证书后立即"},{"key":"B","text":"证书签发日期后 45 天"},{"key":"C","text":"公司注册日期后 45 天"},{"key":"D","text":"仅在通过考试后，与日期无关"}]', 'B', '规则是证书签发日期加 45 个日历日。', false),

  ('22222222-2222-4222-8222-222222222203', 'th', 'จุดประสงค์ของการโทรยืนยันตัวตนกับธนาคารคืออะไร',
   '[{"key":"A","text":"ขายผลิตภัณฑ์ของธนาคาร"},{"key":"B","text":"ยืนยันว่าคุณเป็นผู้มีอำนาจของบริษัทจริง"},{"key":"C","text":"ตรวจสอบเครดิตส่วนบุคคล"},{"key":"D","text":"ประเมินราคาทรัพย์สิน"}]', 'B', 'ธนาคารต้องยืนยันว่าผู้ติดต่อคือผู้มีอำนาจของบริษัทตามหนังสือรับรอง', true),
  ('22222222-2222-4222-8222-222222222203', 'en', 'What is the purpose of the bank verification call?',
   '[{"key":"A","text":"To sell bank products"},{"key":"B","text":"To confirm you truly represent the company"},{"key":"C","text":"To check your personal credit"},{"key":"D","text":"To appraise property"}]', 'B', 'The bank confirms the caller is the authorised person named on the certificate.', false),
  ('22222222-2222-4222-8222-222222222203', 'zh', '银行验证通话的目的是什么？',
   '[{"key":"A","text":"推销银行产品"},{"key":"B","text":"确认您确实代表该公司"},{"key":"C","text":"检查个人信用"},{"key":"D","text":"评估财产"}]', 'B', '银行需确认来电者是证书上列明的授权人。', false),

  ('22222222-2222-4222-8222-222222222204', 'th', 'ทุนจดทะเบียนของ {company_name_th} คือเท่าไร',
   '[{"key":"A","text":"{registered_capital} บาท"},{"key":"B","text":"{registered_capital|x2} บาท"},{"key":"C","text":"{registered_capital|x0.5} บาท"},{"key":"D","text":"{registered_capital|x10} บาท"}]', 'A', 'ทุนจดทะเบียนตามหนังสือรับรองคือ {registered_capital} บาท', true),
  ('22222222-2222-4222-8222-222222222204', 'en', 'What is the registered capital of {company_name_th}?',
   '[{"key":"A","text":"{registered_capital} THB"},{"key":"B","text":"{registered_capital|x2} THB"},{"key":"C","text":"{registered_capital|x0.5} THB"},{"key":"D","text":"{registered_capital|x10} THB"}]', 'A', 'The certificate states a registered capital of {registered_capital} THB.', false),
  ('22222222-2222-4222-8222-222222222204', 'zh', '{company_name_th} 的注册资本是多少？',
   '[{"key":"A","text":"{registered_capital} 泰铢"},{"key":"B","text":"{registered_capital|x2} 泰铢"},{"key":"C","text":"{registered_capital|x0.5} 泰铢"},{"key":"D","text":"{registered_capital|x10} 泰铢"}]', 'A', '证书载明的注册资本为 {registered_capital} 泰铢。', false),

  ('22222222-2222-4222-8222-222222222205', 'th', 'เลขทะเบียนนิติบุคคลของบริษัทคุณคือหมายเลขใด',
   '[{"key":"A","text":"{juristic_id}"},{"key":"B","text":"{juristic_id|shuffle}"},{"key":"C","text":"{juristic_id|shuffle}"},{"key":"D","text":"{juristic_id|shuffle}"}]', 'A', 'เลขทะเบียนนิติบุคคล 13 หลักตามหนังสือรับรองคือ {juristic_id}', true),
  ('22222222-2222-4222-8222-222222222205', 'en', 'Which is your company''s juristic person number?',
   '[{"key":"A","text":"{juristic_id}"},{"key":"B","text":"{juristic_id|shuffle}"},{"key":"C","text":"{juristic_id|shuffle}"},{"key":"D","text":"{juristic_id|shuffle}"}]', 'A', 'The 13-digit number on the certificate is {juristic_id}.', false),
  ('22222222-2222-4222-8222-222222222205', 'zh', '您公司的法人注册号是哪一个？',
   '[{"key":"A","text":"{juristic_id}"},{"key":"B","text":"{juristic_id|shuffle}"},{"key":"C","text":"{juristic_id|shuffle}"},{"key":"D","text":"{juristic_id|shuffle}"}]', 'A', '证书上的 13 位号码是 {juristic_id}。', false),

  ('22222222-2222-4222-8222-222222222206', 'th', 'หนังสือรับรองของบริษัทคุณออกให้เมื่อวันที่ใด',
   '[{"key":"A","text":"{issued_on}"},{"key":"B","text":"{issued_on|+1m}"},{"key":"C","text":"{issued_on|-1m}"},{"key":"D","text":"{issued_on|-1y}"}]', 'A', 'วันที่ออกหนังสือรับรองคือ {issued_on}', true),
  ('22222222-2222-4222-8222-222222222206', 'en', 'On what date was your company certificate issued?',
   '[{"key":"A","text":"{issued_on}"},{"key":"B","text":"{issued_on|+1m}"},{"key":"C","text":"{issued_on|-1m}"},{"key":"D","text":"{issued_on|-1y}"}]', 'A', 'The certificate was issued on {issued_on}.', false),
  ('22222222-2222-4222-8222-222222222206', 'zh', '您的公司证书签发于哪一天？',
   '[{"key":"A","text":"{issued_on}"},{"key":"B","text":"{issued_on|+1m}"},{"key":"C","text":"{issued_on|-1m}"},{"key":"D","text":"{issued_on|-1y}"}]', 'A', '证书签发日期为 {issued_on}。', false)
on conflict (question_id, language) do nothing;

-- Approve after the localizations exist (the approval trigger requires all three languages).
update public.questions set approval_status = 'approved'
where question_key like 'sample-%' and approval_status = 'draft';
