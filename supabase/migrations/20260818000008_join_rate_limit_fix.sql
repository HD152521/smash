-- ════════════════════════════════════════════════════════════════════
-- H-2. 초대 코드 브루트포스 차단이 실제로는 동작하지 않던 문제
--
-- 원인:
--   실패를 join_attempts 에 기록한 뒤 raise exception 을 던졌는데,
--   PostgREST 는 RPC 1회 = 트랜잭션 1개다. 예외가 밖으로 나가면
--   트랜잭션 전체가 롤백되면서 방금 넣은 실패 기록도 함께 사라진다.
--   그래서 테이블에는 succeeded = true 행만 남았고,
--   `count(*) ... where not succeeded` 는 영원히 0 이었다.
--   10회 차단은 한 번도 발동한 적이 없다. (실제 DB 조회로 확인)
--
--   서브트랜잭션으로 감싸도 마지막에 re-raise 하면 결국 같이 롤백된다.
--   시퀀스처럼 비트랜잭션 카운터를 쓸 수도 없다(사용자별로 만들 수 없음).
--
-- 해결:
--   예외를 던지지 않고 결과를 jsonb 로 돌려준다. 트랜잭션이 커밋되므로
--   실패 기록이 남고 카운터가 실제로 올라간다.
--
--   대가: HTTP 상태가 항상 200 이 된다. 클라이언트가 error 필드를 보고
--   메시지를 고른다. 브루트포스 방어가 상태 코드보다 중요하다고 판단했다.
-- ════════════════════════════════════════════════════════════════════

drop function if exists join_tournament(text, text);

create function join_tournament(p_code text, p_display_name text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament tournaments;
  v_code text;
  v_uid uuid := auth.uid();
  v_recent_failures int;
  v_profile profiles;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated',
                              'message', '로그인이 필요합니다');
  end if;

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select count(*) into v_recent_failures
  from join_attempts
  where user_id = v_uid
    and not succeeded
    and attempted_at > now() - interval '10 minutes';

  if v_recent_failures >= 10 then
    return jsonb_build_object(
      'ok', false, 'error', 'rate_limited',
      'message', '잘못된 코드를 너무 많이 입력했습니다. 10분 뒤에 다시 시도해 주세요');
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    return jsonb_build_object('ok', false, 'error', 'bad_format',
                              'message', '초대 코드는 6자리입니다');
  end if;

  select * into v_tournament from tournaments where invite_code = v_code;

  if not found then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    return jsonb_build_object('ok', false, 'error', 'not_found',
                              'message', '그런 코드의 대회가 없습니다');
  end if;

  if v_tournament.status = 'finished' then
    -- 코드 자체는 맞았으므로 브루트포스 카운터에는 넣지 않는다
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, true);
    return jsonb_build_object('ok', false, 'error', 'finished',
                              'message', '이미 종료된 대회입니다');
  end if;

  insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, true);

  -- 프로필이 없으면 만들어 준다. 없으면 멤버가 0행 삽입되어
  -- "성공했다는데 참가가 안 된" 상태가 된다.
  v_profile := ensure_profile(v_uid);

  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url)
  values (
    v_tournament.id, v_uid, 'member',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url
  )
  on conflict (tournament_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'tournament', to_jsonb(v_tournament));
end;
$fn$;

revoke all on function join_tournament(text, text) from public, anon;
grant execute on function join_tournament(text, text) to authenticated;

-- ── create_tournament 도 프로필 누락에 대비한다 ─────────────────────
-- 주최자 멤버 행이 안 만들어지면 tournaments_select 정책상
-- 아무도 볼 수 없는 고아 대회가 생긴다.
create or replace function create_tournament(
  p_name               text,
  p_description        text,
  p_group_count        int,
  p_joker_group_count  int,
  p_display_name       text,
  p_normal_points      int default 21,
  p_joker_points       int default 11
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament tournaments;
  v_code text;
  v_uid uuid := auth.uid();
  v_profile profiles;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception '대회 이름을 입력해 주세요' using errcode = '22023';
  end if;
  if p_group_count < 2 or p_group_count > 20 then
    raise exception '조는 2개 이상 20개 이하로 만들 수 있습니다' using errcode = '22023';
  end if;
  if p_joker_group_count < 0 or p_joker_group_count > p_group_count then
    raise exception '조커조 개수는 0 이상 전체 조 개수 이하여야 합니다' using errcode = '22023';
  end if;
  if p_normal_points < 1 or p_normal_points > 99 or p_joker_points < 1 or p_joker_points > 99 then
    raise exception '목표 점수는 1점 이상 99점 이하여야 합니다' using errcode = '22023';
  end if;

  v_profile := ensure_profile(v_uid);

  for attempt in 1..10 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from tournaments where invite_code = v_code);
    if attempt = 10 then
      raise exception '초대 코드 생성에 실패했습니다. 다시 시도해 주세요' using errcode = '40001';
    end if;
  end loop;

  insert into tournaments (name, description, invite_code, owner_id, config)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    v_code,
    v_uid,
    jsonb_build_object(
      'format',          'doubles',
      'normalPoints',    p_normal_points,
      'jokerPoints',     p_joker_points,
      'deuce',           false,
      'winPoints',       1.0,
      'jokerWinPoints',  0.5,
      'lossPoints',      0,
      'jokerGroupCount', p_joker_group_count
    )
  )
  returning * into v_tournament;

  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url)
  values (
    v_tournament.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url
  );

  insert into groups (tournament_id, name, sort_order, is_joker)
  select v_tournament.id, i || '조', i, (i <= p_joker_group_count)
  from generate_series(1, p_group_count) as i;

  perform log_audit(v_tournament.id, 'tournament.create', 'tournament', v_tournament.id,
                    null, to_jsonb(v_tournament));

  return v_tournament;
end;
$fn$;

revoke all on function create_tournament(text, text, int, int, text, int, int) from public, anon;
grant execute on function create_tournament(text, text, int, int, text, int, int) to authenticated;
