-- J-Learner Vocabulary v1.9.0 — „Połącz w nowy zestaw”
-- Kopiuje fiszki z kilku lekcji do nowej lekcji wywołującego, bez duplikatów.
-- Uruchom w Supabase SQL Editor po wcześniejszych migracjach. Idempotentna.

/**
 * Nowa lekcja z fiszek kilku lekcji.
 *
 * Łączyć można tylko lekcje, do których ma się dostęp: własne albo przypisane
 * mi jako nauczycielowi. Oryginały zostają nietknięte. To samo słówko
 * (ta sama normalizacja co `mergeKey()` w lib/merge.ts) trafia raz — wygrywa
 * lekcja wcześniej na liście `p_sources`. Komentarz ucznia przechodzi tylko
 * z lekcji, których wywołujący jest właścicielem, bo to jego komentarze.
 *
 * Funkcja jest `security definer`, bo uczeń nie może sam wstawiać fiszek
 * (od v1.7.0 treść fiszek pisze nauczyciel) — tutaj kopiuje gotowe fiszki.
 */
create or replace function public.english_merge_lessons(p_sources uuid[], p_title text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
  v_allowed integer;
  v_new_id uuid;
  v_titles text;
begin
  if v_uid is null then
    raise exception 'Zaloguj się, żeby połączyć lekcje';
  end if;

  v_count := coalesce(array_length(p_sources, 1), 0);
  if v_count < 2 then
    raise exception 'Zaznacz co najmniej dwie lekcje';
  end if;
  if v_count > 20 then
    raise exception 'Połączyć można najwyżej 20 lekcji naraz';
  end if;
  if (select count(distinct s) from unnest(p_sources) s) <> v_count then
    raise exception 'Ta sama lekcja jest zaznaczona dwa razy';
  end if;

  select count(*) into v_allowed
  from public.english_lessons l
  where l.id = any(p_sources)
    and (l.owner_id = v_uid or l.assigned_teacher_id = v_uid);
  if v_allowed <> v_count then
    raise exception 'Brak dostępu do którejś z lekcji';
  end if;

  select string_agg(l.title, ', ' order by src.pos)
  into v_titles
  from unnest(p_sources) with ordinality as src(id, pos)
  join public.english_lessons l on l.id = src.id;

  insert into public.english_lessons (
    owner_id, lesson_date, title, status, lesson_kind, description
  )
  values (
    v_uid,
    current_date,
    left(coalesce(nullif(btrim(p_title), ''), 'Powtórka'), 200),
    'draft',
    'lesson',
    left('Połączone z: ' || coalesce(v_titles, ''), 500)
  )
  returning id into v_new_id;

  insert into public.english_lesson_cards (
    lesson_id, card_type, english, polish, review_direction, phonetic, pronunciation,
    note, example, british_variant, american_variant, student_comment, order_index, author_id
  )
  select
    v_new_id, d.card_type, d.english, d.polish, d.review_direction, d.phonetic,
    d.pronunciation, d.note, d.example, d.british_variant, d.american_variant,
    d.student_comment,
    (row_number() over (order by d.pos, d.order_index, d.created_at) - 1)::integer,
    d.author_id
  from (
    select distinct on (k.merge_key)
      k.*
    from (
      select
        c.card_type, c.english, c.polish, c.review_direction, c.phonetic, c.pronunciation,
        c.note, c.example, c.british_variant, c.american_variant,
        case when l.owner_id = v_uid then c.student_comment else '' end as student_comment,
        coalesce(c.author_id, v_uid) as author_id,
        c.order_index, c.created_at, src.pos,
        case
          -- Fiszka bez angielskiej strony nie ma czego porównać — zostaje zawsze.
          when btrim(c.english) = '' then 'id:' || c.id::text
          when c.card_type = 'pronunciation'
            then 'pronunciation:' || lower(btrim(regexp_replace(c.english, '\s+', ' ', 'g')))
          else lower(btrim(regexp_replace(c.english, '\s+', ' ', 'g')))
        end as merge_key
      from unnest(p_sources) with ordinality as src(id, pos)
      join public.english_lessons l on l.id = src.id
      join public.english_lesson_cards c on c.lesson_id = src.id
    ) k
    order by k.merge_key, k.pos, k.order_index, k.created_at
  ) d;

  return v_new_id;
end;
$$;

revoke execute on function public.english_merge_lessons(uuid[], text) from public;
grant execute on function public.english_merge_lessons(uuid[], text) to authenticated;
revoke execute on function public.english_merge_lessons(uuid[], text) from anon;
