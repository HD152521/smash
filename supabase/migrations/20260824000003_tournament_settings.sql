-- ════════════════════════════════════════════════════════════════════
-- 대회 설정
--
-- config 에는 이미 여러 키가 있었지만 화면에서 닿을 수 있는 건 목표 점수
-- 둘뿐이었다. format(단식/복식)과 승점은 서버가 실제로 읽어 쓰는데도
-- 바꿀 방법이 없었고, 만들어진 뒤에는 아예 손댈 수 없었다.
--
-- ── 이 마이그레이션이 하는 일 ───────────────────────────────────────
--
--   1. config 의 모양을 한 곳(normalize_tournament_config)에 정의한다.
--      생성과 수정이 같은 검증을 지나게 하려면 검증이 한 벌이어야 한다.
--   2. create_tournament 이 점수 두 개 대신 config 를 통째로 받는다.
--      설정이 늘 때마다 인자를 늘리면 시그니처가 계속 바뀌고, 그때마다
--      revoke/grant 를 다시 써야 한다.
--   3. update_tournament_config 를 연다. 지금은 guard_tournament_update 가
--      config 직접 수정을 막고 있어 RPC 없이는 바꿀 길이 없다.
--   4. 기존 대회에 새 키를 채운다.
--
-- ── 설정을 바꾸면 이미 편성된 경기는 어떻게 되나 ────────────────────
--
-- 아직 시작 안 한 경기(scheduled)는 새 규칙으로 다시 굳힌다. 21점으로
-- 바꿨는데 오늘 저녁 경기가 11점 그대로면 바꾼 의미가 없다.
--
-- 진행 중이거나 끝난 경기는 건드리지 않는다. 판정 근거가 도중에 바뀌면
-- 이미 나온 결과와 순위가 소급 변조된다.
-- ════════════════════════════════════════════════════════════════════

-- ── config 에서 규칙을 꺼내는 함수 (스냅샷용) ───────────────────────
create or replace function rule_target_score(p_config jsonb, p_is_joker boolean) returns int
language sql immutable set search_path = public, pg_temp as $fn$
  select (case when p_is_joker then p_config->>'jokerPoints'
               else p_config->>'normalPoints' end)::int;
$fn$;

create or replace function rule_win_points(p_config jsonb, p_is_joker boolean) returns numeric
language sql immutable set search_path = public, pg_temp as $fn$
  select (case when p_is_joker then p_config->>'jokerWinPoints'
               else p_config->>'winPoints' end)::numeric;
$fn$;

-- ── 설정의 모양과 검증 ──────────────────────────────────────────────
--
-- 빠진 키는 기본값으로 채운다. 그래야 예전에 만든 대회도 새 키를 갖는다.
-- null 은 '값이 없음' 이 아니라 뜻이 있는 값이다 (상한 없음 / 자동 계산).
create or replace function normalize_tournament_config(
  p_config jsonb,
  p_base   jsonb default null
) returns jsonb
language plpgsql immutable set search_path = public, pg_temp as $fn$
declare
  v jsonb;
  v_normal int;
  v_joker  int;
  v_cap    int;
  v_jcap   int;
  v_change int;
begin
  v := jsonb_build_object(
         'format',             'doubles',
         'normalPoints',       21,
         'jokerPoints',        11,
         'deuce',              false,
         'deuceCap',           null::int,   -- null = 상한 없음 (2점 차 날 때까지)
         'jokerDeuceCap',      null::int,
         'winPoints',          1.0,
         'jokerWinPoints',     0.5,
         'lossPoints',         0,      -- 순위 계산이 쓰지 않는다. 호환용으로만 남긴다.
         'jokerGroupCount',    0,
         'courtChange',        false,
         'courtChangeAt',      null::int,   -- null = 목표 점수의 절반(올림)
         'readyQueuePosition', 2       -- 대기 몇 번째부터 '곧 차례' 알림을 보낼지
       )
       || coalesce(p_base, '{}'::jsonb)
       || coalesce(p_config, '{}'::jsonb);

  if v->>'format' not in ('doubles', 'singles') then
    raise exception '경기 방식은 단식 또는 복식만 가능합니다' using errcode = '22023';
  end if;

  v_normal := (v->>'normalPoints')::int;
  v_joker  := (v->>'jokerPoints')::int;
  if v_normal < 1 or v_normal > 99 or v_joker < 1 or v_joker > 99 then
    raise exception '목표 점수는 1점 이상 99점 이하여야 합니다' using errcode = '22023';
  end if;

  if jsonb_typeof(v->'deuce') <> 'boolean' then
    raise exception '듀스 설정이 올바르지 않습니다' using errcode = '22023';
  end if;

  v_cap  := (v->>'deuceCap')::int;
  v_jcap := (v->>'jokerDeuceCap')::int;
  if v_cap is not null and (v_cap < v_normal or v_cap > 99) then
    raise exception '듀스 상한은 목표 점수 이상 99점 이하여야 합니다' using errcode = '22023';
  end if;
  if v_jcap is not null and (v_jcap < v_joker or v_jcap > 99) then
    raise exception '조커조 듀스 상한은 목표 점수 이상 99점 이하여야 합니다' using errcode = '22023';
  end if;

  if (v->>'winPoints')::numeric < 0 or (v->>'winPoints')::numeric > 99
     or (v->>'jokerWinPoints')::numeric < 0 or (v->>'jokerWinPoints')::numeric > 99 then
    raise exception '승점은 0 이상 99 이하여야 합니다' using errcode = '22023';
  end if;

  if jsonb_typeof(v->'courtChange') <> 'boolean' then
    raise exception '코트 체인지 설정이 올바르지 않습니다' using errcode = '22023';
  end if;

  v_change := (v->>'courtChangeAt')::int;
  if v_change is not null and (v_change < 1 or v_change >= greatest(v_normal, v_joker)) then
    raise exception '코트 체인지 점수는 1점 이상, 목표 점수보다 낮아야 합니다' using errcode = '22023';
  end if;

  if (v->>'readyQueuePosition')::int < 1 or (v->>'readyQueuePosition')::int > 10 then
    raise exception '대기 알림 순번은 1 이상 10 이하여야 합니다' using errcode = '22023';
  end if;

  return v;
end;
$fn$;

-- ── 기존 대회에 새 키를 채운다 ──────────────────────────────────────
-- 마이그레이션은 postgres 로 돈다 → is_direct_api_call() 이 거짓이라
-- guard_tournament_update 의 config 잠금을 통과한다.
update tournaments
   set config = normalize_tournament_config('{}'::jsonb, config);

-- ── 대회 만들기 ─────────────────────────────────────────────────────
--
-- 인자가 바뀌므로 예전 것을 먼저 지운다. create or replace 로는 시그니처를
-- 못 바꾸고, 남겨 두면 이름이 같은 함수가 둘이 되어 PostgREST 가 어느 쪽을
-- 부를지 모른다 ("function is not unique").
drop function if exists create_tournament(text, text, int, int, text, int, int);

create or replace function create_tournament(
  p_name               text,
  p_description        text,
  p_group_count        int,
  p_joker_group_count  int,
  p_display_name       text,
  p_config             jsonb default '{}'::jsonb
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament tournaments;
  v_code    text;
  v_uid     uuid := auth.uid();
  v_profile profiles;
  v_config  jsonb;
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

  -- 조커조 개수는 groups.is_joker 가 진실이다. config 쪽은 그 사본이므로
  -- 부르는 쪽이 뭘 보냈든 인자 값으로 덮는다.
  v_config := normalize_tournament_config(
    coalesce(p_config, '{}'::jsonb) || jsonb_build_object('jokerGroupCount', p_joker_group_count)
  );

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
    v_config
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

revoke all on function create_tournament(text, text, int, int, text, jsonb) from public, anon;
grant execute on function create_tournament(text, text, int, int, text, jsonb) to authenticated;

-- ── 설정 바꾸기 ─────────────────────────────────────────────────────
create or replace function update_tournament_config(
  p_tournament_id uuid,
  p_config        jsonb
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tournament tournaments;
  v_before jsonb;
  v_config jsonb;
begin
  select * into v_tournament from tournaments where id = p_tournament_id for update;
  if not found then
    raise exception '대회를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not is_tournament_admin(p_tournament_id) then
    raise exception '관리자만 대회 설정을 바꿀 수 있습니다' using errcode = '42501';
  end if;

  v_before := v_tournament.config;

  -- jokerGroupCount 는 groups.is_joker 의 사본이다. 여기서 바꾸면 둘이 어긋난다.
  v_config := normalize_tournament_config(
    coalesce(p_config, '{}'::jsonb) - 'jokerGroupCount',
    v_tournament.config
  );

  update tournaments set config = v_config, updated_at = now()
   where id = p_tournament_id
  returning * into v_tournament;

  -- 아직 시작 안 한 경기만 새 규칙으로 다시 굳힌다.
  -- 진행 중·끝난 경기를 건드리면 이미 나온 판정과 순위가 소급 변조된다.
  update match_teams mt
     set target_score = rule_target_score(v_config, mt.is_joker),
         win_points   = rule_win_points(v_config, mt.is_joker),
         deuce        = rule_deuce(v_config),
         max_score    = rule_max_score(v_config, mt.is_joker)
    from matches m
   where m.id = mt.match_id
     and m.tournament_id = p_tournament_id
     and m.status = 'scheduled';

  perform log_audit(p_tournament_id, 'tournament.config', 'tournament', p_tournament_id,
                    v_before, v_config);

  return v_tournament;
end;
$fn$;

revoke all on function update_tournament_config(uuid, jsonb) from public, anon;
grant execute on function update_tournament_config(uuid, jsonb) to authenticated;

revoke all on function normalize_tournament_config(jsonb, jsonb) from public, anon, authenticated;
revoke all on function rule_target_score(jsonb, boolean) from public, anon, authenticated;
revoke all on function rule_win_points(jsonb, boolean)   from public, anon, authenticated;
revoke all on function rule_deuce(jsonb)                 from public, anon, authenticated;
revoke all on function rule_max_score(jsonb, boolean)    from public, anon, authenticated;
revoke all on function side_wins(int, int, int, boolean, int) from public, anon, authenticated;
revoke all on function decide_winner(int, int, int, int, boolean, boolean, int, int)
  from public, anon, authenticated;
