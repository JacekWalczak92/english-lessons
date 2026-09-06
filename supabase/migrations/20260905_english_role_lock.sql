-- J-Learner English Lessons v1.6.0
-- Jeden tryb na konto: rola jest przypisywana przy rejestracji i nie zmienia się
-- z poziomu aplikacji. Uruchom w Supabase SQL Editor PO migracji
-- 20260904_english_lessons_accounts.sql. Migracja jest idempotentna.

-- --------------------------------------------------- 1. rola konta jest stała

/**
 * Blokada zmiany roli.
 *
 * Wyzwalacz odrzuca zmianę tylko wtedy, gdy przychodzi od zalogowanego
 * użytkownika (`auth.uid()` jest ustawione). Zapytanie z SQL Editora albo
 * z klucza service_role nie ma `auth.uid()`, więc administrator dalej może
 * poprawić błędnie wybraną rolę:
 *
 *   update public.english_profiles set role = 'student' where user_id = '...';
 */
create or replace function public.english_lock_profile_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and (select auth.uid()) is not null then
    raise exception 'Rola konta jest przypisana na stałe. Do drugiego trybu załóż osobne konto.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_english_profile_role_lock on public.english_profiles;
create trigger trg_english_profile_role_lock
before update on public.english_profiles
for each row execute function public.english_lock_profile_role();

-- ------------------------------------------- 2. co wolno w danym trybie konta

create or replace function public.english_account_role(p_user uuid)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(
    (select p.role from public.english_profiles p where p.user_id = p_user),
    'student'
  );
$$;

/**
 * Zestawy w bibliotece prowadzi nauczyciel.
 *
 * Uczeń dalej może mieć własne lekcje (m.in. kopie z biblioteki), ale nie
 * wystawi zestawu wszystkim ani nie założy lekcji typu `set`.
 */
create or replace function public.english_guard_lesson_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.english_account_role(new.owner_id);
begin
  if v_role <> 'teacher' then
    if new.lesson_kind = 'set' then
      raise exception 'Gotowe zestawy słówek tworzy konto nauczyciela.';
    end if;
    if new.is_published then
      raise exception 'Publikować w bibliotece może konto nauczyciela.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_english_lesson_kind_guard on public.english_lessons;
drop trigger if exists trg_english_lesson_kind_guard_ins on public.english_lessons;
create trigger trg_english_lesson_kind_guard_ins
before insert on public.english_lessons
for each row execute function public.english_guard_lesson_kind();

-- Przy UPDATE sprawdzamy tylko realną zmianę tych dwóch pól: wiersz lekcji jest
-- aktualizowany także przez licznik fiszek i nie ma po co odpytywać wtedy o rolę.
drop trigger if exists trg_english_lesson_kind_guard_upd on public.english_lessons;
create trigger trg_english_lesson_kind_guard_upd
before update on public.english_lessons
for each row
when (
  new.lesson_kind is distinct from old.lesson_kind
  or new.is_published is distinct from old.is_published
)
execute function public.english_guard_lesson_kind();

-- ------------------------------- 3. do lekcji kodem dołącza wyłącznie uczeń

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

  -- Jeden tryb na konto: nauczyciel prowadzi własne lekcje, nie zapisuje się
  -- na cudze jako uczeń.
  if public.english_account_role(v_uid) <> 'student' then
    raise exception 'Kodem dołącza konto ucznia. Na koncie nauczyciela otwórz własną lekcję.';
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

grant execute on function public.english_join_lesson(text) to authenticated;
revoke execute on function public.english_join_lesson(text) from anon;
