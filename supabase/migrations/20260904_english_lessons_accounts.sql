-- J-Learner English Lessons v1.4.0
-- Konta uczniów, wspólne lekcje z kodem dołączenia i biblioteka gotowych zestawów.
-- Uruchom w Supabase SQL Editor PO migracji 20260824_english_lessons.sql.
-- Migracja jest idempotentna — można ją puścić drugi raz bez skutków ubocznych.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- 1. profile

create table if not exists public.english_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('teacher', 'student')),
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_english_profiles_updated_at on public.english_profiles;
create trigger trg_english_profiles_updated_at
before update on public.english_profiles
for each row execute function public.set_english_lesson_updated_at();

-- Rola wybrana na ekranie rejestracji trafia do user_metadata; tutaj przepisujemy
-- ją do tabeli, żeby nie ufać danym, które użytkownik może zmienić w JWT-cie.
create or replace function public.handle_new_english_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data ->> 'app_role', 'student');
  v_name text := coalesce(new.raw_user_meta_data ->> 'display_name', '');
begin
  if v_role not in ('teacher', 'student') then
    v_role := 'student';
  end if;

  insert into public.english_profiles (user_id, role, display_name)
  values (new.id, v_role, left(v_name, 80))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_english_profile_on_signup on auth.users;
create trigger trg_english_profile_on_signup
after insert on auth.users
for each row execute function public.handle_new_english_user();

-- Konta założone przed v1.4.0 są właścicielami lekcji, więc dostają rolę nauczyciela.
-- Rolę pojedynczego konta zmienisz później w aplikacji albo ręcznie:
--   update public.english_profiles set role = 'student' where user_id = '...';
insert into public.english_profiles (user_id, role)
select id, 'teacher' from auth.users
on conflict (user_id) do nothing;

-- ------------------------------------------------------- 2. lekcje: nowe pola

alter table public.english_lessons
  add column if not exists lesson_kind text not null default 'lesson',
  add column if not exists description text not null default '',
  add column if not exists join_code text,
  add column if not exists join_enabled boolean not null default true,
  add column if not exists is_published boolean not null default false,
  add column if not exists peer_visibility boolean not null default true,
  add column if not exists card_count integer not null default 0,
  add column if not exists source_lesson_id uuid references public.english_lessons(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'english_lessons_kind_check'
  ) then
    alter table public.english_lessons
      add constraint english_lessons_kind_check check (lesson_kind in ('lesson', 'set'));
  end if;
end;
$$;

-- Kod dołączenia: 8 znaków bez I, O, 0 i 1, bo bywa przepisywany z ekranu.
create or replace function public.english_new_join_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try integer := 0;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.english_lessons l where l.join_code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'Nie udało się wylosować kodu dołączenia';
    end if;
  end loop;
  return v_code;
end;
$$;

update public.english_lessons
set join_code = public.english_new_join_code()
where join_code is null;

alter table public.english_lessons alter column join_code set not null;
alter table public.english_lessons alter column join_code set default public.english_new_join_code();

create unique index if not exists english_lessons_join_code_idx on public.english_lessons(join_code);
create index if not exists english_lessons_library_idx
  on public.english_lessons(is_published, lesson_kind, updated_at desc);

-- --------------------------------------------------------- 3. fiszki: autorzy

alter table public.english_lesson_cards
  add column if not exists author_id uuid references auth.users(id) on delete set null;

create index if not exists english_lesson_cards_author_idx
  on public.english_lesson_cards(lesson_id, author_id);

-- Licznik fiszek trzymamy w kolumnie, żeby lista lekcji i biblioteka nie musiały
-- pobierać wszystkich wierszy tylko po to, by pokazać „24 fiszki”.
create or replace function public.english_sync_card_count_ins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.english_lessons l
  set card_count = l.card_count + s.added
  from (select n.lesson_id, count(*) as added from new_rows n group by n.lesson_id) s
  where l.id = s.lesson_id;
  return null;
end;
$$;

create or replace function public.english_sync_card_count_del()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.english_lessons l
  set card_count = greatest(l.card_count - s.removed, 0)
  from (select o.lesson_id, count(*) as removed from old_rows o group by o.lesson_id) s
  where l.id = s.lesson_id;
  return null;
end;
$$;

-- Wyzwalacze są STATEMENT-owe: import 500 fiszek to jeden UPDATE licznika,
-- a nie 500 kolejnych zapisów tego samego wiersza lekcji.
drop trigger if exists trg_english_cards_count on public.english_lesson_cards;
drop trigger if exists trg_english_cards_count_ins on public.english_lesson_cards;
create trigger trg_english_cards_count_ins
after insert on public.english_lesson_cards
referencing new table as new_rows
for each statement execute function public.english_sync_card_count_ins();

drop trigger if exists trg_english_cards_count_del on public.english_lesson_cards;
create trigger trg_english_cards_count_del
after delete on public.english_lesson_cards
referencing old table as old_rows
for each statement execute function public.english_sync_card_count_del();

update public.english_lessons l
set card_count = (
  select count(*) from public.english_lesson_cards c where c.lesson_id = l.id
);

-- ------------------------------------------------------------ 4. członkostwa

create table if not exists public.english_lesson_members (
  lesson_id uuid not null references public.english_lessons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'student' check (member_role in ('teacher', 'student')),
  display_name text not null default '',
  -- Eksport na Drive jest per konto: każdy uczeń ma własny plik w swoim Drive.
  drive_file_id text,
  drive_file_name text,
  last_exported_at timestamptz,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);

create index if not exists english_lesson_members_user_idx
  on public.english_lesson_members(user_id, joined_at desc);

drop trigger if exists trg_english_members_updated_at on public.english_lesson_members;
create trigger trg_english_members_updated_at
before update on public.english_lesson_members
for each row execute function public.set_english_lesson_updated_at();

-- ------------------------------------------------- 5. pomocnicze SECURITY DEFINER
-- Polityki RLS lekcji pytają o członkostwo, a polityki członkostwa o właściciela
-- lekcji. Gdyby robiły to zwykłym `exists (select ...)`, Postgres wpadłby
-- w rekurencję polityk. Funkcje definiera przecinają ten cykl.

create or replace function public.english_is_lesson_owner(p_lesson uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.english_lessons l
    where l.id = p_lesson and l.owner_id = (select auth.uid())
  );
$$;

create or replace function public.english_is_lesson_member(p_lesson uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.english_lesson_members m
    where m.lesson_id = p_lesson and m.user_id = (select auth.uid())
  );
$$;

-- ------------------------------------------------------------------- 6. RLS

alter table public.english_profiles enable row level security;
alter table public.english_lesson_members enable row level security;

drop policy if exists english_profiles_self_select on public.english_profiles;
create policy english_profiles_self_select
on public.english_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists english_profiles_self_insert on public.english_profiles;
create policy english_profiles_self_insert
on public.english_profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists english_profiles_self_update on public.english_profiles;
create policy english_profiles_self_update
on public.english_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Lekcje: właściciel, uczestnik albo opublikowany zestaw z biblioteki.
drop policy if exists english_lessons_owner_select on public.english_lessons;
drop policy if exists english_lessons_visible_select on public.english_lessons;
create policy english_lessons_visible_select
on public.english_lessons for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (is_published and lesson_kind = 'set')
  or public.english_is_lesson_member(id)
);

-- Modyfikacje lekcji zostają wyłącznie po stronie właściciela (jak w v1.3.0).

-- Fiszki: dodatkowo do odczytu w opublikowanych zestawach (podgląd biblioteki).
drop policy if exists english_cards_owner_select on public.english_lesson_cards;
drop policy if exists english_cards_visible_select on public.english_lesson_cards;
create policy english_cards_visible_select
on public.english_lesson_cards for select
to authenticated
using (
  public.english_is_lesson_owner(lesson_id)
  or exists (
    select 1 from public.english_lessons l
    where l.id = lesson_id and l.is_published and l.lesson_kind = 'set'
  )
);

-- Zapisy uczniów idą przez Edge Function (waliduje autora i status lekcji),
-- więc polityki INSERT/UPDATE/DELETE zostają przy właścicielu.

drop policy if exists english_members_read on public.english_lesson_members;
create policy english_members_read
on public.english_lesson_members for select
to authenticated
using ((select auth.uid()) = user_id or public.english_is_lesson_owner(lesson_id));

-- Zapisanie się na lekcję odbywa się tylko przez english_join_lesson(kod).
drop policy if exists english_members_leave on public.english_lesson_members;
create policy english_members_leave
on public.english_lesson_members for delete
to authenticated
using ((select auth.uid()) = user_id or public.english_is_lesson_owner(lesson_id));

-- ------------------------------------------------------------------ 7. RPC

/**
 * Dołączenie do lekcji kodem. Kod sam w sobie jest zaproszeniem, więc funkcja
 * jest definiera — uczeń nie widzi lekcji, dopóki nie zostanie jej członkiem.
 */
create or replace function public.english_join_lesson(p_code text)
returns table (lesson_id uuid, title text, teacher_name text, already_member boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_lesson public.english_lessons;
  v_name text := '';
  v_existing boolean;
begin
  if v_uid is null then
    raise exception 'Zaloguj się, żeby dołączyć do lekcji';
  end if;

  select * into v_lesson from public.english_lessons l where l.join_code = v_code;
  if not found then
    raise exception 'Nie ma lekcji o tym kodzie';
  end if;
  if not v_lesson.join_enabled then
    raise exception 'Nauczyciel wyłączył dołączanie do tej lekcji';
  end if;
  if v_lesson.owner_id = v_uid then
    return query select v_lesson.id, v_lesson.title, v_lesson.teacher_name, true;
    return;
  end if;

  select coalesce(p.display_name, '') into v_name
  from public.english_profiles p where p.user_id = v_uid;

  select exists (
    select 1 from public.english_lesson_members m
    where m.lesson_id = v_lesson.id and m.user_id = v_uid
  ) into v_existing;

  insert into public.english_lesson_members (lesson_id, user_id, member_role, display_name)
  values (v_lesson.id, v_uid, 'student', coalesce(v_name, ''))
  on conflict (lesson_id, user_id)
  do update set display_name = excluded.display_name;

  return query select v_lesson.id, v_lesson.title, v_lesson.teacher_name, v_existing;
end;
$$;

/**
 * Kopia gotowego zestawu (albo własnej lekcji) na konto wywołującego.
 * Uczeń dostaje własną lekcję, którą może dalej edytować i eksportować na swój
 * Drive — bez ruszania oryginału nauczyciela.
 */
create or replace function public.english_copy_lesson(p_source uuid, p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_source public.english_lessons;
  v_new_id uuid;
  v_is_member boolean;
begin
  if v_uid is null then
    raise exception 'Zaloguj się, żeby skopiować lekcję';
  end if;

  select * into v_source from public.english_lessons l where l.id = p_source;
  if not found then
    raise exception 'Nie ma takiej lekcji';
  end if;

  select exists (
    select 1 from public.english_lesson_members m
    where m.lesson_id = v_source.id and m.user_id = v_uid
  ) into v_is_member;

  if not (
    (v_source.is_published and v_source.lesson_kind = 'set')
    or v_source.owner_id = v_uid
    or v_is_member
  ) then
    raise exception 'Brak dostępu do tej lekcji';
  end if;

  insert into public.english_lessons (
    owner_id, lesson_date, title, teacher_name, status, lesson_kind,
    description, share_enabled, source_lesson_id
  )
  values (
    v_uid,
    current_date,
    left(coalesce(nullif(p_title, ''), v_source.title), 200),
    v_source.teacher_name,
    'draft',
    'lesson',
    v_source.description,
    false,
    v_source.id
  )
  returning id into v_new_id;

  insert into public.english_lesson_cards (
    lesson_id, card_type, english, polish, review_direction, phonetic, pronunciation,
    note, example, british_variant, american_variant, order_index, author_id
  )
  select
    v_new_id, c.card_type, c.english, c.polish, c.review_direction, c.phonetic,
    c.pronunciation, c.note, c.example, c.british_variant, c.american_variant,
    c.order_index, v_uid
  from public.english_lesson_cards c
  where c.lesson_id = v_source.id
    and (
      v_source.owner_id = v_uid
      or (v_source.is_published and v_source.lesson_kind = 'set')
      -- Kopiując lekcję, w której jestem uczniem, biorę słówka nauczyciela i swoje.
      or c.author_id is null
      or c.author_id = v_source.owner_id
      or c.author_id = v_uid
    );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------- 8. granty

grant select, insert, update on public.english_profiles to authenticated;
grant select, delete on public.english_lesson_members to authenticated;
revoke all on public.english_profiles from anon;
revoke all on public.english_lesson_members from anon;

grant execute on function public.english_join_lesson(text) to authenticated;
grant execute on function public.english_copy_lesson(uuid, text) to authenticated;
revoke execute on function public.english_join_lesson(text) from anon;
revoke execute on function public.english_copy_lesson(uuid, text) from anon;
