-- The DBD pack says who a company is, but not how to reach it or what it actually sells, and the
-- study cards and the question bank are built on both. A record may not be confirmed — and so may
-- not be assigned to a learner — until the manager has written all four (owner, 2026-09-24).
--
-- NOT VALID: records confirmed before this rule existed keep their status and are asked for the
-- four only when they are next edited. A validating constraint would fail this migration on them.

create or replace function public.interview_answer(p_structured jsonb, p_field text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(coalesce(p_structured #>> array['interview', p_field], '')), '');
$$;

revoke all on function public.interview_answer(jsonb, text) from public, anon, authenticated;
grant execute on function public.interview_answer(jsonb, text) to authenticated, service_role;

alter table public.dbd_records
  add constraint dbd_confirmed_requires_business_answers
  check (
    extraction_status <> 'confirmed'
    or (
      public.interview_answer(structured_data, 'contact_email') is not null
      and public.interview_answer(structured_data, 'contact_phone') is not null
      and public.interview_answer(structured_data, 'nature_of_business') is not null
      and public.interview_answer(structured_data, 'products_services') is not null
    )
  ) not valid;

comment on constraint dbd_confirmed_requires_business_answers on public.dbd_records is
  'A confirmed record carries the company contact and what it sells; the certificate holds neither.';
