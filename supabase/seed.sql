-- Development/pilot seed: three fictional sample study cards so the portal has content on day one.
-- Replace with the owner's approved material through /admin/content. Contains no real data.

insert into public.study_materials (id, content_key, type, sort_order, active) values
  ('11111111-1111-4111-8111-111111111101', 'sample-dbd-certificate', 'card', 10, true),
  ('11111111-1111-4111-8111-111111111102', 'sample-company-facts', 'card', 20, true),
  ('11111111-1111-4111-8111-111111111103', 'sample-bank-visit', 'card', 30, true)
on conflict (content_key) do nothing;

insert into public.study_material_localizations (material_id, language, title, body, tts_enabled) values
  ('11111111-1111-4111-8111-111111111101', 'th', '[ตัวอย่าง] หนังสือรับรองบริษัทคืออะไร',
   E'หนังสือรับรอง (DBD) คือเอกสารที่กรมพัฒนาธุรกิจการค้าออกให้ เพื่อรับรองข้อมูลของบริษัทที่จดทะเบียน\n\nข้อมูลสำคัญที่ปรากฏในหนังสือรับรอง:\n\n- เลขทะเบียนนิติบุคคล 13 หลัก\n- ชื่อบริษัทและวันที่จดทะเบียน\n- กรรมการและอำนาจกรรมการ\n- ทุนจดทะเบียน\n- ที่ตั้งสำนักงานใหญ่\n\n**วันที่ออกหนังสือรับรอง** อยู่ท้ายเอกสาร และเป็นวันที่ใช้นับ 45 วันก่อนการยืนยันตัวตนกับธนาคาร', true),
  ('11111111-1111-4111-8111-111111111101', 'en', '[Sample] What is a company certificate?',
   E'The DBD certificate is issued by the Department of Business Development to certify a registered company''s details.\n\nKey information on the certificate:\n\n- The 13-digit juristic person number\n- Company name and registration date\n- Directors and signing authority\n- Registered capital\n- Head office address\n\n**The issue date** at the bottom of the certificate starts the 45-day count before bank verification.', false),
  ('11111111-1111-4111-8111-111111111101', 'zh', '[示例] 什么是公司证书？',
   E'DBD 证书由商业发展厅签发，用于证明已注册公司的信息。\n\n证书上的关键信息：\n\n- 13 位法人注册号\n- 公司名称和注册日期\n- 董事及签署权限\n- 注册资本\n- 总部地址\n\n**证书底部的签发日期**是银行验证前 45 天计算的起点。', false),

  ('11111111-1111-4111-8111-111111111102', 'th', '[ตัวอย่าง] ข้อมูลบริษัทที่ต้องจำ',
   E'ก่อนการยืนยันตัวตนกับธนาคาร คุณควรจำข้อมูลต่อไปนี้ของบริษัทได้อย่างแม่นยำ:\n\n1. ชื่อบริษัทภาษาไทยและภาษาอังกฤษ\n2. เลขทะเบียนนิติบุคคล\n3. ทุนจดทะเบียน\n4. ที่อยู่สำนักงานใหญ่\n5. ชื่อกรรมการทุกคน\n6. ประเภทธุรกิจหลัก\n\nข้อมูลเหล่านี้แสดงอยู่ในหน้าหลักของพอร์ทัล', true),
  ('11111111-1111-4111-8111-111111111102', 'en', '[Sample] Company facts to remember',
   E'Before bank verification you should know these company details precisely:\n\n1. Company name in Thai and English\n2. Juristic person number\n3. Registered capital\n4. Head office address\n5. Every director''s name\n6. Main business activity\n\nAll of these are shown on your dashboard.', false),
  ('11111111-1111-4111-8111-111111111102', 'zh', '[示例] 需要记住的公司信息',
   E'在银行验证之前，您应准确掌握以下公司信息：\n\n1. 公司的泰文和英文名称\n2. 法人注册号\n3. 注册资本\n4. 总部地址\n5. 每位董事的姓名\n6. 主要经营业务\n\n这些信息都显示在您的首页上。', false),

  ('11111111-1111-4111-8111-111111111103', 'th', '[ตัวอย่าง] การยืนยันตัวตนกับธนาคาร',
   E'เจ้าหน้าที่ธนาคารจะถามคำถามเพื่อยืนยันว่าคุณคือผู้มีอำนาจของบริษัทจริง\n\nตัวอย่างคำถามที่พบบ่อย:\n\n- บริษัทของคุณทำธุรกิจอะไร\n- บริษัทตั้งอยู่ที่ไหน\n- ใครเป็นกรรมการ\n- ทุนจดทะเบียนเท่าไร\n\nตอบอย่างมั่นใจและตรงกับหนังสือรับรอง', true),
  ('11111111-1111-4111-8111-111111111103', 'en', '[Sample] The bank verification call',
   E'A bank officer will ask questions to confirm you truly represent the company.\n\nCommon questions:\n\n- What does your company do?\n- Where is it located?\n- Who are the directors?\n- What is the registered capital?\n\nAnswer confidently and consistently with the certificate.', false)
on conflict (material_id, language) do nothing;
