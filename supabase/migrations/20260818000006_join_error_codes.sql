-- ════════════════════════════════════════════════════════════════════
-- join_tournament 의 오류를 올바른 HTTP 상태로 내보낸다.
--
-- PostgREST 는 SQLSTATE 'PTxxx' 를 HTTP xxx 로 매핑한다.
-- 기존 'P0002'(no_data_found) 는 500 으로 나가서, 대회 중에 로그를 볼 때
-- "코드를 잘못 입력한 사용자" 와 "진짜 서버 장애" 가 구분되지 않았다.
-- 참가는 가장 자주 실패하는 경로라 여기부터 바로잡는다.
--
--   없는 코드      → 404
--   횟수 초과      → 429
--   형식 오류·종료 → 400 (22023, 기존 유지)
--   권한 없음      → 403 (42501, 기존 유지)
-- ════════════════════════════════════════════════════════════════════

create or replace function join_tournament(
  p_code          text,
  p_display_name  text default null
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament tournaments;
  v_code text;
  v_uid uuid := auth.uid();
  v_recent_failures int;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select count(*) into v_recent_failures
  from join_attempts
  where user_id = v_uid
    and not succeeded
    and attempted_at > now() - interval '10 minutes';

  if v_recent_failures >= 10 then
    raise exception '잘못된 코드를 너무 많이 입력했습니다. 10분 뒤에 다시 시도해 주세요'
      using errcode = 'PT429';
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    raise exception '초대 코드는 6자리입니다' using errcode = '22023';
  end if;

  select * into v_tournament from tournaments where invite_code = v_code;

  if not found then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    raise exception '그런 코드의 대회가 없습니다' using errcode = 'PT404';
  end if;

  if v_tournament.status = 'finished' then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    raise exception '이미 종료된 대회입니다' using errcode = '22023';
  end if;

  insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, true);

  -- 이미 참가한 사람이 코드를 다시 넣어도 그냥 들어가진다 (멱등)
  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url)
  select
    v_tournament.id, v_uid, 'member',
    coalesce(nullif(btrim(p_display_name), ''), p.name, '이름없음'),
    p.avatar_url
  from profiles p where p.id = v_uid
  on conflict (tournament_id, user_id) do nothing;

  return v_tournament;
end;
$fn$;

-- 함수를 replace 하면 권한이 유지되지만, 기본 권한 재부여를 확실히 걷어낸다
revoke all on function join_tournament(text, text) from public, anon;
grant execute on function join_tournament(text, text) to authenticated;
