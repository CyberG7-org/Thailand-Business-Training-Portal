-- Company and learner contact details are optional; name cards print only what is available.
alter table public.dbd_records
  drop constraint if exists dbd_confirmed_requires_business_answers;

alter table public.dbd_records
  add constraint dbd_confirmed_requires_business_answers
  check (
    extraction_status <> 'confirmed'
    or (
      public.interview_answer(structured_data, 'nature_of_business') is not null
      and public.interview_answer(structured_data, 'products_services') is not null
    )
  ) not valid;

alter table public.name_cards alter column phone_number drop not null;
