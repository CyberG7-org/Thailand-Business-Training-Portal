-- D80: one "Create learner & DBD" page for staff.
--
-- 1. A learner carries the contact details their manager gives them: a phone (which also
--    prefills their name card), an email, and optionally a website and a Facebook page. They
--    are not sign-in details — the login email stays the internal one — and only staff write
--    them, through the server; learners have no update policy on profiles.
alter table public.profiles
  add column phone text,
  add column contact_email text,
  add column website text,
  add column facebook_page text;

comment on column public.profiles.phone is
  'A learner''s Thai mobile number as given by their manager (D80); prefills the name card.';
comment on column public.profiles.contact_email is
  'A learner''s own email as given by their manager (D80); never the sign-in address.';

-- 2. A record the background reader found clean confirms itself (D80), on behalf of the staff
--    member who uploaded it. The flag says so in the record and in its audit trail, so an
--    automatic confirmation is never mistaken for a person having checked the record.
alter table public.dbd_records
  add column confirmed_automatically boolean not null default false;

comment on column public.dbd_records.confirmed_automatically is
  'True when the reader confirmed the record itself because it was clean (D80).';
