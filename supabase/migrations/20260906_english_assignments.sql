-- J-Learner English Lessons v1.7.1
-- Uczeń przypisuje lekcję nauczycielowi z listy kont w systemie. Znikają kody
-- dołączenia i tajne linki. Treść fiszek wypełnia nauczyciel, uczeń dopisuje
-- komentarz. Uruchom w Supabase SQL Editor PO 20260905_english_role_lock.sql.
-- Migracja jest idempotentna.

-- ------------------------------- 1. nowe kolumny (przed funkcjami, które ich używają)

alter table public.english_profiles
  add column if not exists accepting_students boolean not null default true;

alter table public.english_lessons
  add column if not exists assigned_teacher_id uuid references auth.users(id) on delete set null,
  add column if not exists assigned_at timestamptz,
  -- Prośba ucznia „o co chodzi w tej lekcji” — nauczyciel widzi ją przed wypełnieniem.
  add column if not exists student_request text not null default '';

create index if not exists english_lessons_assigned_idx
  on public.english_lessons(assigned_teacher_id, lesson_date desc);

-- ------------------------------------------- 2. katalog nauczycieli i profile

/**
 * Widoczność profili.
 *
 * Uczeń musi zobaczyć listę nauczycieli, a obie strony lekcji — swoje imiona.
 * Nikt inny nie widzi cudzych profili.
 */
create or replace function public.english_shares_lesson_with(p_user uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.english_lessons l
    where (l.owner_id = p_user and l.assigned_teacher_id = (select auth.uid()))
       or (l.assigned_teacher_id = p_user and l.owner_id = (select auth.uid()))
  );
$$;

/**
 * Przypisać lekcję można wyłącznie kontu nauczyciela, który przyjmuje uczniów.
 * Sprawdzamy to w bazie, bo lista nauczycieli przychodzi z przeglądarki.
 */
create or replace function public.english_guard_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if new.assigned_teacher_id is null then
    new.assigned_at := null;
    return new;
  end if;

  if new.assigned_teacher_id = new.owner_id then
    raise exception 'Nie można przypisać lekcji samemu sobie.';
  end if;

  select p.role into v_role
  from public.english_profiles p where p.user_id = new.assigned_teacher_id;

  if v_role is distinct from 'teacher' then
    raise exception 'Lekcję można przypisać tylko kontu nauczyciela.';
  end if;

  if tg_op = 'INSERT' or new.assigned_teacher_id is distinct from old.assigned_teacher_id then
    new.assigned_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_english_assignment_guard on public.english_lessons;
create trigger trg_english_assignment_guard
before insert or update on public.english_lessons
for each row
when (new.assigned_teacher_id is not null)
execute function public.english_guard_assignment();

-- --------------------------------------------- 3. komentarz ucznia w fiszce

alter table public.english_lesson_cards
  add column if not exists student_comment text not null default '';

-- ------------------------------------- 4. stan eksportu na Drive per konto

create table if not exists public.english_lesson_exports (
  lesson_id uuid not null references public.english_lessons(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  drive_file_id text,
  drive_file_name text,
  last_exported_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (lesson_id, user_id)
);

drop trigger if exists trg_english_exports_updated_at on public.english_lesson_exports;
create trigger trg_english_exports_updated_at
before update on public.english_lesson_exports
for each row execute function public.set_english_lesson_updated_at();

-- Przeniesienie dotychczasowego stanu eksportu właścicieli i uczniów z v1.4.0.
insert into public.english_lesson_exports (lesson_id, user_id, drive_file_id, drive_file_name, last_exported_at)
select l.id, l.owner_id, l.drive_file_id, l.drive_file_name, l.last_exported_at
from public.english_lessons l
where l.drive_file_id is not null
on conflict (lesson_id, user_id) do nothing;

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'english_lesson_members') then
    insert into public.english_lesson_exports (lesson_id, user_id, drive_file_id, drive_file_name, last_exported_at)
    select m.lesson_id, m.user_id, m.drive_file_id, m.drive_file_name, m.last_exported_at
    from public.english_lesson_members m
    where m.drive_file_id is not null
    on conflict (lesson_id, user_id) do nothing;
  end if;
end;
$$;

-- ------------------------------- 5. przeniesienie lekcji z modelu z kodami
-- Uczeń zapisany kodem na lekcję nauczyciela dostaje własną lekcję przypisaną
-- temu nauczycielowi, razem ze swoimi fiszkami. Lekcja nauczyciela zostaje jego.

do $$
declare
  v_member record;
  v_new_id uuid;
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'public' and table_name = 'english_lesson_members') then
    return;
  end if;

  for v_member in
    select m.lesson_id, m.user_id, m.display_name, l.title, l.lesson_date, l.teacher_name,
           l.owner_id,
           -- Lekcję da się przypisać tylko koncie nauczyciela; gdy poprzednim
           -- właścicielem był uczeń, kopia powstaje bez przypisania.
           coalesce((select p.role from public.english_profiles p where p.user_id = l.owner_id), '')
             = 'teacher' as owner_is_teacher
    from public.english_lesson_members m
    join public.english_lessons l on l.id = m.lesson_id
    where l.lesson_kind = 'lesson'
      and not exists (
        select 1 from public.english_lessons c
        where c.owner_id = m.user_id and c.source_lesson_id = m.lesson_id
      )
  loop
    insert into public.english_lessons (
      owner_id, lesson_date, title, teacher_name, status, lesson_kind,
      assigned_teacher_id, source_lesson_id, share_enabled, join_enabled
    )
    values (
      v_member.user_id, v_member.lesson_date, v_member.title, v_member.teacher_name,
      'draft', 'lesson',
      case when v_member.owner_is_teacher then v_member.owner_id else null end,
      v_member.lesson_id, false, false
    )
    returning id into v_new_id;

    insert into public.english_lesson_cards (
      lesson_id, card_type, english, polish, review_direction, phonetic, pronunciation,
      note, example, british_variant, american_variant, order_index, author_id
    )
    select v_new_id, c.card_type, c.english, c.polish, c.review_direction, c.phonetic,
           c.pronunciation, c.note, c.example, c.british_variant, c.american_variant,
           c.order_index, v_member.owner_id
    from public.english_lesson_cards c
    where c.lesson_id = v_member.lesson_id;
  end loop;
end;
$$;

-- Linki i kody przestają obowiązywać: nic ich już nie honoruje w kodzie,
-- a tutaj domykamy je też w danych.
update public.english_lessons
set share_enabled = false, join_enabled = false
where share_enabled or join_enabled;

-- ------------------------------------------------------------------ 6. RLS

drop policy if exists english_profiles_self_select on public.english_profiles;
drop policy if exists english_profiles_visible_select on public.english_profiles;
create policy english_profiles_visible_select
on public.english_profiles for select
to authenticated
using (
  (select auth.uid()) = user_id
  or role = 'teacher'
  or public.english_shares_lesson_with(user_id)
);

drop policy if exists english_lessons_visible_select on public.english_lessons;
create policy english_lessons_visible_select
on public.english_lessons for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or (select auth.uid()) = assigned_teacher_id
  or (is_published and lesson_kind = 'set')
);

alter table public.english_lesson_exports enable row level security;

drop policy if exists english_exports_self on public.english_lesson_exports;
create policy english_exports_self
on public.english_lesson_exports for select
to authenticated
using ((select auth.uid()) = user_id);

grant select on public.english_lesson_exports to authenticated;
revoke all on public.english_lesson_exports from anon;

-- Kod dołączenia nie ma już zastosowania — funkcja zostaje wycofana.
drop function if exists public.english_join_lesson(text);
