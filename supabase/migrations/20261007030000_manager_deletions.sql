-- A company can be removed without deleting its learner. Everything derived from that company
-- goes with it, including the active assignment, so the learner can be assigned a fresh DBD.

alter table public.user_dbd_assignments
  drop constraint user_dbd_assignments_dbd_record_id_fkey,
  add constraint user_dbd_assignments_dbd_record_id_fkey
    foreign key (dbd_record_id) references public.dbd_records (id) on delete cascade;

alter table public.eligibility_snapshots
  drop constraint eligibility_snapshots_dbd_record_id_fkey,
  add constraint eligibility_snapshots_dbd_record_id_fkey
    foreign key (dbd_record_id) references public.dbd_records (id) on delete cascade;

alter table public.assessment_attempts
  drop constraint assessment_attempts_dbd_record_id_fkey,
  add constraint assessment_attempts_dbd_record_id_fkey
    foreign key (dbd_record_id) references public.dbd_records (id) on delete cascade;

alter table public.name_cards
  drop constraint name_cards_dbd_record_id_fkey,
  add constraint name_cards_dbd_record_id_fkey
    foreign key (dbd_record_id) references public.dbd_records (id) on delete cascade;

alter table public.interview_sessions
  drop constraint interview_sessions_dbd_record_id_fkey,
  add constraint interview_sessions_dbd_record_id_fkey
    foreign key (dbd_record_id) references public.dbd_records (id) on delete cascade;

alter table public.appointments
  drop constraint appointments_dbd_record_id_fkey,
  add constraint appointments_dbd_record_id_fkey
    foreign key (dbd_record_id) references public.dbd_records (id) on delete cascade;
