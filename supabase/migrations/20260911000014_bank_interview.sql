-- P13: bank-interview concepts (decision D39). Company-level interview answers live in
-- `dbd_records.structured_data.interview`; the learner's own role in the company is on the
-- assignment so placeholders like {my_shares} resolve per learner.

alter table public.user_dbd_assignments
  add column holder_name text,
  add column position text,
  add column responsibilities text,
  add column relationship_to_shareholders text;

comment on column public.user_dbd_assignments.holder_name is
  'The learner''s name as printed in the DBD documents (matches a director and/or shareholder entry).';
