-- D63: the holder's name is typed by the learner beside the phone number, and each card
-- version keeps the names it was printed with.
alter table public.name_cards
  add column holder_name text,
  add column holder_name_en text;
