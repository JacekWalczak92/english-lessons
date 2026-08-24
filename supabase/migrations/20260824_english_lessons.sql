-- J-Learner English Lessons v1
-- Uruchom w Supabase SQL Editor na projekcie używanym przez aplikację Android.

create extension if not exists pgcrypto;

create or replace function public.set_english_lesson_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.english_lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lesson_date date not null default current_date,
  title text not null default 'English lesson',
  teacher_name text,
  status text not null default 'draft' check (status in ('draft', 'finished')),
  share_enabled boolean not null default true,
  share_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  drive_file_id text,
  drive_file_name text,
  last_exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.english_lesson_cards (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.english_lessons(id) on delete cascade,
  card_type text not null default 'word_phrase'
    check (card_type in ('translation_sentence', 'word_phrase', 'pronunciation', 'british', 'custom')),
  english text not null default '',
  polish text not null default '',
  review_direction text not null default 'PL_TO_EN'
    check (review_direction in ('EN_TO_PL', 'PL_TO_EN', 'PRONUNCIATION')),
  phonetic text not null default '',
  pronunciation text not null default '',
  note text not null default '',
  example text not null default '',
  british_variant text not null default '',
  american_variant text not null default '',
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists english_lessons_owner_date_idx
  on public.english_lessons(owner_id, lesson_date desc);
create index if not exists english_lesson_cards_lesson_order_idx
  on public.english_lesson_cards(lesson_id, order_index, created_at);

alter table public.english_lessons enable row level security;
alter table public.english_lesson_cards enable row level security;

-- Owner ma pełny dostęp przez zwykły publishable key + JWT.
drop policy if exists english_lessons_owner_select on public.english_lessons;
create policy english_lessons_owner_select
on public.english_lessons for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists english_lessons_owner_insert on public.english_lessons;
create policy english_lessons_owner_insert
on public.english_lessons for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists english_lessons_owner_update on public.english_lessons;
create policy english_lessons_owner_update
on public.english_lessons for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists english_lessons_owner_delete on public.english_lessons;
create policy english_lessons_owner_delete
on public.english_lessons for delete
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists english_cards_owner_select on public.english_lesson_cards;
create policy english_cards_owner_select
on public.english_lesson_cards for select
to authenticated
using (
  exists (
    select 1 from public.english_lessons l
    where l.id = lesson_id and l.owner_id = (select auth.uid())
  )
);

drop policy if exists english_cards_owner_insert on public.english_lesson_cards;
create policy english_cards_owner_insert
on public.english_lesson_cards for insert
to authenticated
with check (
  exists (
    select 1 from public.english_lessons l
    where l.id = lesson_id and l.owner_id = (select auth.uid())
  )
);

drop policy if exists english_cards_owner_update on public.english_lesson_cards;
create policy english_cards_owner_update
on public.english_lesson_cards for update
to authenticated
using (
  exists (
    select 1 from public.english_lessons l
    where l.id = lesson_id and l.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.english_lessons l
    where l.id = lesson_id and l.owner_id = (select auth.uid())
  )
);

drop policy if exists english_cards_owner_delete on public.english_lesson_cards;
create policy english_cards_owner_delete
on public.english_lesson_cards for delete
to authenticated
using (
  exists (
    select 1 from public.english_lessons l
    where l.id = lesson_id and l.owner_id = (select auth.uid())
  )
);

-- Trigger updated_at.
drop trigger if exists trg_english_lessons_updated_at on public.english_lessons;
create trigger trg_english_lessons_updated_at
before update on public.english_lessons
for each row execute function public.set_english_lesson_updated_at();

drop trigger if exists trg_english_cards_updated_at on public.english_lesson_cards;
create trigger trg_english_cards_updated_at
before update on public.english_lesson_cards
for each row execute function public.set_english_lesson_updated_at();

-- Jawne granty (przydatne także w projektach z nowymi, bardziej restrykcyjnymi default privileges).
grant select, insert, update, delete on public.english_lessons to authenticated;
grant select, insert, update, delete on public.english_lesson_cards to authenticated;
revoke all on public.english_lessons from anon;
revoke all on public.english_lesson_cards from anon;
