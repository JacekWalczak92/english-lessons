-- J-Learner English Lessons v1.8.0 — karta „Moje słówka”
-- Słówka wyszukane w aplikacji Słownik (Android), zaimportowane do konta.
-- Uruchom w Supabase SQL Editor po wcześniejszych migracjach. Idempotentna.

create extension if not exists pgcrypto;

create table if not exists public.english_my_words (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  english text not null check (char_length(btrim(english)) between 1 and 2000),
  polish text not null check (char_length(btrim(polish)) between 1 and 2000),
  source_lang text not null default 'en' check (source_lang in ('en', 'pl')),
  kind text not null default 'word' check (kind in ('word', 'sentence')),
  favorite boolean not null default false,
  looked_up_at timestamptz,
  source text not null default 'slownik-app' check (char_length(source) <= 40),
  external_id text check (external_id is null or char_length(external_id) <= 64),
  -- Ta sama normalizacja co `dedupeKey()` w lib/word-export-format.ts:
  -- ponowny import tego samego słówka nie tworzy duplikatu.
  dedupe_key text generated always as (lower(btrim(regexp_replace(english, '\s+', ' ', 'g')))) stored,
  created_at timestamptz not null default now()
);

create unique index if not exists english_my_words_user_key_idx
  on public.english_my_words(user_id, dedupe_key);
create index if not exists english_my_words_user_date_idx
  on public.english_my_words(user_id, looked_up_at desc nulls last, created_at desc);

alter table public.english_my_words enable row level security;

-- Słówka są prywatne: widzi i zmienia je wyłącznie właściciel konta.
drop policy if exists english_my_words_owner_select on public.english_my_words;
create policy english_my_words_owner_select
on public.english_my_words for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists english_my_words_owner_insert on public.english_my_words;
create policy english_my_words_owner_insert
on public.english_my_words for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists english_my_words_owner_update on public.english_my_words;
create policy english_my_words_owner_update
on public.english_my_words for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists english_my_words_owner_delete on public.english_my_words;
create policy english_my_words_owner_delete
on public.english_my_words for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.english_my_words to authenticated;
