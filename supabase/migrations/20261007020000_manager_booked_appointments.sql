-- P18c / D102: managers pick one date per ready learner; there are no team time slots.

drop index if exists public.appointments_one_per_slot;

-- The old UI already tried to keep one upcoming booking. If legacy or concurrent data contains
-- more, retain the newest row and close the rest before making that rule structural.
with ranked as (
  select
    id,
    row_number() over (partition by user_id order by created_at desc, id desc) as position
  from public.appointments
  where status = 'booked'
)
update public.appointments as appointment
set
  status = 'cancelled',
  cancelled_at = coalesce(appointment.cancelled_at, now())
from ranked
where appointment.id = ranked.id and ranked.position > 1;

create unique index appointments_one_booked_per_learner
  on public.appointments (user_id)
  where status = 'booked';
