-- ════════════════════════════════════════════════════════════════════
-- 모임 모드 — 점수를 세지 않고 코트만 돌린다
--
-- 이 앱은 대회용으로 만들어졌다. 그래서 두 가지를 전제로 깔고 있다:
--
--   1) 경기의 한 편은 '조' 다      (match_teams.group_id not null)
--   2) 끝난 경기는 승자가 있다     (winner_only_when_finished)
--
-- 정기모임은 둘 다 아니다. 사람 넷이 코트에 들어가고, 끝났는지만 알면 된다.
-- 점수는 세고 싶은 사람만 센다.
--
-- ── 왜 status 를 늘리지 않았나 ──────────────────────────────────────
--
-- '그냥 끝' 을 match_status 에 'ended' 로 넣는 쪽이 자연스러워 보이지만,
-- status 를 보는 곳이 여기저기 있다 (get_standings 는 'finished' 만 세고,
-- 화면의 대진표·기록도 각자 필터를 갖는다). 값을 하나 늘리면 그 모든 곳이
-- 새 값을 모르는 채 지나가고, 결과는 '어디에도 안 뜨는 경기' 다.
--
-- 그래서 status 는 그대로 두고 matches.scored 를 둔다.
-- scored 는 미리 고르는 게 아니라 끝낼 때 정해진다 — 점수를 한 번도 안
-- 넣었으면 false. 설정도 버튼도 늘지 않고, 한 모임 안에서 어떤 게임은 세고
-- 어떤 게임은 안 세는 것이 자연히 된다.
--
-- ── 목표 점수는 모임 경기에도 그대로 넣는다 ─────────────────────────
--
-- match_teams.target_score 를 nullable 로 만들지 않는다. 점수를 세기로 한
-- 사람에게는 21점 자동 종료와 '3점 남음' 이 대회와 똑같이 동작해야 하고,
-- nullable 로 만들면 record_score · undo_score · 심판 화면이 전부 NULL
-- 분기를 갖게 되는데 얻는 게 없다. 안 세는 사람은 0:0 에서 끝내면 된다.
-- ════════════════════════════════════════════════════════════════════

do $$ begin
  create type tournament_kind as enum ('tournament', 'session');
exception when duplicate_object then null;
end $$;

alter table tournaments
  add column if not exists kind tournament_kind not null default 'tournament';

comment on column tournaments.kind is
  'tournament = 조별 대회 (순위·심판·목표점수) / session = 정기모임 (코트 정리만)';

-- ── '점수를 셌나' ───────────────────────────────────────────────────
alter table matches
  add column if not exists scored boolean not null default true;

comment on column matches.scored is
  '점수를 실제로 기록한 경기인가. false 면 승자 없이 끝난 모임 경기다.';

-- 끝난 경기에 승자가 없어도 되는 경우를 딱 하나 연다: 점수를 안 센 경기.
alter table matches drop constraint if exists winner_only_when_finished;
alter table matches add constraint winner_only_when_finished check (
  (status = 'finished' and (winner_side is not null or not scored)) or
  (status <> 'finished' and winner_side is null)
);

-- ── 모임 경기는 조가 없다 ───────────────────────────────────────────
alter table match_teams alter column group_id drop not null;

comment on column match_teams.group_id is
  '대회 경기는 조, 모임 경기는 NULL. NULL 이면 get_standings 의 조인에서 빠진다.';

-- ── 이 경기를 돌릴 수 있는 사람 ─────────────────────────────────────
--
-- 대회는 편성 때 지정된 심판이 점수를 넣는다. 모임에는 심판이 없다 —
-- 넷이 모여 치는데 그 중 한 명을 심판으로 세울 수는 없다.
--
-- 경계를 함수 하나에 모은다. 시작·코트잡기·득점·취소·종료가 같은 판단을
-- 써야 하고, 다섯 곳에 같은 OR 를 복사하면 나중에 한 곳만 고치게 된다.
create or replace function is_match_player(mid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1
    from match_team_players mtp
    join match_teams mt on mt.id = mtp.match_team_id
    join tournament_members tm on tm.id = mtp.member_id
    where mt.match_id = mid and tm.user_id = auth.uid()
  );
$fn$;

create or replace function is_session_match(mid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select exists (
    select 1 from matches m
    join tournaments t on t.id = m.tournament_id
    where m.id = mid and t.kind = 'session'
  );
$fn$;

create or replace function can_run_match(mid uuid)
returns boolean language sql security definer stable
set search_path = public, pg_temp as $fn$
  select is_match_referee(mid)
      or is_tournament_admin(match_tournament_id(mid))
      -- 모임에서는 뛰는 사람이 자기 경기를 돌린다.
      -- '자기 경기' 가 핵심이다 — 남의 코트 경기는 여전히 못 건드린다.
      or (is_session_match(mid) and is_match_player(mid));
$fn$;

revoke all on function is_match_player(uuid)   from public, anon;
revoke all on function is_session_match(uuid)  from public, anon;
revoke all on function can_run_match(uuid)     from public, anon;
grant execute on function is_match_player(uuid)  to authenticated;
grant execute on function is_session_match(uuid) to authenticated;
grant execute on function can_run_match(uuid)    to authenticated;

-- ── 모임 열기 ───────────────────────────────────────────────────────
--
-- create_tournament 을 쓰지 않는다. 그쪽은 조를 2개 이상 요구하고
-- (p_group_count between 2 and 20) 조커 구성을 받는다. 모임은 조가 0개다.
-- 검증 규칙이 다르므로 함수를 따로 둔다 — 하나에 몰면 서로의 검사를
-- if 로 건너뛰는 코드가 된다.
--
-- status 를 바로 'live' 로 둔다. 모임은 준비 기간이 없고, draft 로 두면
-- 참가자가 '조 선택' 온보딩으로 끌려간다.
create or replace function create_session(
  p_name         text,
  p_display_name text,
  p_court_count  int default 2
) returns tournaments
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_session tournaments;
  v_code    text;
  v_uid     uuid := auth.uid();
  v_profile profiles;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception '모임 이름을 입력해 주세요' using errcode = '22023';
  end if;
  if p_court_count < 1 or p_court_count > 20 then
    raise exception '코트는 1개 이상 20개 이하로 만들 수 있습니다' using errcode = '22023';
  end if;

  v_profile := ensure_profile(v_uid);

  for attempt in 1..10 loop
    v_code := gen_invite_code();
    exit when not exists (select 1 from tournaments where invite_code = v_code);
    if attempt = 10 then
      raise exception '초대 코드 생성에 실패했습니다. 다시 시도해 주세요' using errcode = '40001';
    end if;
  end loop;

  insert into tournaments (name, invite_code, owner_id, status, kind, config)
  values (
    btrim(p_name), v_code, v_uid, 'live', 'session',
    normalize_tournament_config('{}'::jsonb)
  )
  returning * into v_session;

  insert into tournament_members (tournament_id, user_id, role, display_name, avatar_url)
  values (
    v_session.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), v_profile.name, '이름없음'),
    v_profile.avatar_url
  );

  -- 코트가 없으면 아무것도 못 한다. 모임은 코트가 곧 화면이다.
  insert into courts (tournament_id, name, sort_order)
  select v_session.id, i || '번 코트', i
  from generate_series(1, p_court_count) as i;

  perform log_audit(v_session.id, 'session.create', 'tournament', v_session.id,
                    null, to_jsonb(v_session));

  return v_session;
end;
$fn$;

revoke all on function create_session(text, text, int) from public, anon;
grant execute on function create_session(text, text, int) to authenticated;

-- ── 모임 경기 편성 ──────────────────────────────────────────────────
--
-- create_match 와 나눠 둔다. 저쪽 검사의 절반이 조에 관한 것이다
-- (같은 조 금지 · 각 조에서 N명 · 선수의 조 소속 확인). 모임에는 조가 없어서
-- 그 검사가 전부 무의미하다.
--
-- 대신 여기 필요한 검사가 따로 있다: 같은 사람이 양쪽에 들어가면 안 된다.
-- 조가 없으니 '같은 조끼리 못 붙는다' 가 그 역할을 대신 못 한다.
create or replace function create_session_match(
  p_tournament_id uuid,
  p_court_id      uuid,
  p_players_a     uuid[],
  p_players_b     uuid[],
  p_label         text default null
) returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match  matches;
  v_config jsonb;
  v_kind   tournament_kind;
  v_squad  int;
  v_team_a uuid;
  v_team_b uuid;
  v_all    uuid[];
begin
  select config, kind into v_config, v_kind
    from tournaments where id = p_tournament_id;
  if not found then
    raise exception '모임을 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if v_kind <> 'session' then
    raise exception '대회 경기는 경기 편성 화면에서 만들어 주세요' using errcode = '22023';
  end if;

  v_all := p_players_a || p_players_b;

  -- 모임장이 짜 주기도 하고, 비는 코트를 보고 본인들이 들어가기도 한다.
  -- 뛰는 사람 본인이면 만들 수 있게 한다 — 그래야 모임장이 매번 안 짜도 된다.
  -- 남을 마음대로 코트에 넣는 건 여전히 관리자만 할 수 있다.
  if not (
    is_tournament_admin(p_tournament_id)
    or exists (select 1 from tournament_members tm
                where tm.id = any(v_all) and tm.user_id = auth.uid())
  ) then
    raise exception '모임장이거나 그 경기에 뛰는 사람만 경기를 만들 수 있습니다'
      using errcode = '42501';
  end if;

  v_squad := case when v_config->>'format' = 'singles' then 1 else 2 end;
  if coalesce(array_length(p_players_a, 1), 0) <> v_squad
     or coalesce(array_length(p_players_b, 1), 0) <> v_squad then
    raise exception '양쪽에 %명씩 골라 주세요', v_squad using errcode = '22023';
  end if;

  -- 같은 사람이 두 번 들어가면 안 된다 (양쪽에 걸치거나 한쪽에 두 번)
  if (select count(distinct x) from unnest(v_all) x) <> array_length(v_all, 1) then
    raise exception '같은 사람을 두 번 넣을 수 없습니다' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(v_all) pid
    where not exists (select 1 from tournament_members tm
                      where tm.id = pid and tm.tournament_id = p_tournament_id)
  ) then
    raise exception '이 모임의 참가자가 아닌 사람이 있습니다' using errcode = '22023';
  end if;

  if p_court_id is not null
     and not exists (select 1 from courts
                     where id = p_court_id and tournament_id = p_tournament_id) then
    raise exception '이 모임의 코트가 아닙니다' using errcode = '22023';
  end if;

  insert into matches (tournament_id, court_id, label, status, source, created_by, updated_by)
  values (p_tournament_id, p_court_id, nullif(btrim(coalesce(p_label, '')), ''),
          'scheduled', 'live', auth.uid(), auth.uid())
  returning * into v_match;

  -- 조가 없으니 group_id 는 NULL, 조커도 없다.
  -- 목표 점수·승점·듀스는 대회와 같은 스냅샷 규칙을 따른다 (세는 사람을 위해).
  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (v_match.id, 'A', null,
          (v_config->>'normalPoints')::int, (v_config->>'winPoints')::numeric, false)
  returning id into v_team_a;

  insert into match_teams (match_id, side, group_id, target_score, win_points, is_joker)
  values (v_match.id, 'B', null,
          (v_config->>'normalPoints')::int, (v_config->>'winPoints')::numeric, false)
  returning id into v_team_b;

  insert into match_team_players (match_team_id, member_id)
  select v_team_a, pid from unnest(p_players_a) pid;
  insert into match_team_players (match_team_id, member_id)
  select v_team_b, pid from unnest(p_players_b) pid;

  return v_match;
end;
$fn$;

revoke all on function create_session_match(uuid, uuid, uuid[], uuid[], text) from public, anon;
grant execute on function create_session_match(uuid, uuid, uuid[], uuid[], text) to authenticated;

-- ── 시작 · 코트 잡기 · 득점 · 취소 · 종료의 권한을 can_run_match 로 ──

create or replace function start_match(p_match_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match matches;
  v_court_name text;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not can_run_match(p_match_id) then
    raise exception '이 경기를 시작할 권한이 없습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception '이미 시작했거나 끝난 경기입니다' using errcode = '22023';
  end if;

  if v_match.court_id is not null then
    select c.name into v_court_name from courts c where c.id = v_match.court_id;
    if exists (select 1 from matches m
               where m.court_id = v_match.court_id and m.status = 'live' and m.id <> p_match_id) then
      raise exception '%에서 진행 중인 경기를 먼저 끝내주세요', v_court_name using errcode = '22023';
    end if;
  end if;

  update matches
  set status = 'live', started_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;

create or replace function claim_court(p_match_id uuid, p_court_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match matches;
  v_court_name text;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not can_run_match(p_match_id) then
    raise exception '이 경기의 심판이나 관리자만 코트를 잡을 수 있습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception '아직 시작하지 않은 경기만 코트를 바꿀 수 있습니다' using errcode = '22023';
  end if;

  select name into v_court_name from courts
  where id = p_court_id and tournament_id = v_match.tournament_id;
  if not found then
    raise exception '이 대회의 코트가 아닙니다' using errcode = '22023';
  end if;

  -- 한 코트 한 경기. 대기열에서 집어가는 순간에도 지켜야 한다.
  if exists (select 1 from matches
             where court_id = p_court_id and status = 'live') then
    raise exception '%에서 진행 중인 경기를 먼저 끝내주세요', v_court_name using errcode = '22023';
  end if;

  update matches set court_id = p_court_id, updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;

create or replace function record_score(
  p_match_id        uuid,
  p_side            team_side,
  p_delta           int,
  p_client_event_id text
) returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match    matches;
  v_rows     int;
  v_score_a  int;
  v_score_b  int;
  v_target_a int;
  v_target_b int;
  v_deuce_a  boolean;
  v_deuce_b  boolean;
  v_max_a    int;
  v_max_b    int;
  v_winner   team_side;
begin
  if p_delta not in (1, -1) then
    raise exception '점수 변화량은 +1 또는 -1 만 가능합니다' using errcode = '22023';
  end if;

  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  if not can_run_match(p_match_id) then
    raise exception '이 경기의 점수를 기록할 권한이 없습니다' using errcode = '42501';
  end if;

  if v_match.status <> 'live' then
    raise exception '진행 중인 경기가 아닙니다' using errcode = '22023';
  end if;

  insert into score_events (match_id, side, delta, client_event_id, created_by)
  values (p_match_id, p_side, p_delta, p_client_event_id, auth.uid())
  on conflict (client_event_id) do nothing;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return v_match;
  end if;

  select
    coalesce(sum(delta) filter (where side = 'A'), 0),
    coalesce(sum(delta) filter (where side = 'B'), 0)
  into v_score_a, v_score_b
  from score_events
  where match_id = p_match_id and not voided;

  if v_score_a < 0 or v_score_b < 0 then
    raise exception '점수는 0점 미만이 될 수 없습니다' using errcode = '22023';
  end if;

  select
    max(target_score) filter (where side = 'A'),
    max(target_score) filter (where side = 'B'),
    bool_or(deuce)    filter (where side = 'A'),
    bool_or(deuce)    filter (where side = 'B'),
    max(max_score)    filter (where side = 'A'),
    max(max_score)    filter (where side = 'B')
  into v_target_a, v_target_b, v_deuce_a, v_deuce_b, v_max_a, v_max_b
  from match_teams where match_id = p_match_id;

  if v_target_a is null or v_target_b is null then
    raise exception '양 팀이 편성되지 않은 경기입니다' using errcode = '22023';
  end if;

  v_winner := decide_winner(v_score_a, v_score_b, v_target_a, v_target_b,
                            v_deuce_a, v_deuce_b, v_max_a, v_max_b);

  update matches set
    score_a     = v_score_a,
    score_b     = v_score_b,
    status      = case when v_winner is not null then 'finished'::match_status else status end,
    winner_side = v_winner,
    finished_at = case when v_winner is not null then now() else finished_at end,
    updated_by  = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;

create or replace function undo_score(p_match_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match     matches;
  v_event_id  bigint;
  v_is_admin  boolean;
  v_score_a   int;
  v_score_b   int;
  v_target_a  int;
  v_target_b  int;
  v_deuce_a   boolean;
  v_deuce_b   boolean;
  v_max_a     int;
  v_max_b     int;
  v_winner    team_side;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  v_is_admin := is_tournament_admin(v_match.tournament_id);

  if not can_run_match(p_match_id) then
    raise exception '이 경기의 점수를 되돌릴 권한이 없습니다' using errcode = '42501';
  end if;

  if v_match.status = 'finished' and not v_is_admin then
    if v_match.finished_at is null or v_match.finished_at < now() - interval '2 minutes' then
      raise exception '종료된 지 2분이 지났습니다. 관리자에게 요청해 주세요' using errcode = '42501';
    end if;
  elsif v_match.status not in ('live', 'finished') then
    raise exception '점수를 되돌릴 수 있는 상태가 아닙니다' using errcode = '22023';
  end if;

  select id into v_event_id
  from score_events
  where match_id = p_match_id and not voided
  order by id desc limit 1;

  if v_event_id is null then
    raise exception '되돌릴 점수가 없습니다' using errcode = '22023';
  end if;

  update score_events set voided = true where id = v_event_id;

  select
    coalesce(sum(delta) filter (where side = 'A'), 0),
    coalesce(sum(delta) filter (where side = 'B'), 0)
  into v_score_a, v_score_b
  from score_events
  where match_id = p_match_id and not voided;

  select
    max(target_score) filter (where side = 'A'),
    max(target_score) filter (where side = 'B'),
    bool_or(deuce)    filter (where side = 'A'),
    bool_or(deuce)    filter (where side = 'B'),
    max(max_score)    filter (where side = 'A'),
    max(max_score)    filter (where side = 'B')
  into v_target_a, v_target_b, v_deuce_a, v_deuce_b, v_max_a, v_max_b
  from match_teams where match_id = p_match_id;

  v_winner := decide_winner(v_score_a, v_score_b, v_target_a, v_target_b,
                            v_deuce_a, v_deuce_b, v_max_a, v_max_b);

  -- 마지막 한 점을 되돌려 점수가 0:0 이 되면, '점수를 안 센 경기' 로 돌아간다.
  -- scored 를 true 로 남겨 두면 승자 없이 끝낼 수 없는 경기가 되어 갇힌다.
  update matches set
    score_a     = v_score_a,
    score_b     = v_score_b,
    status      = case when v_winner is not null then 'finished'::match_status else 'live'::match_status end,
    winner_side = v_winner,
    finished_at = case when v_winner is not null then finished_at else null end,
    scored      = exists (select 1 from score_events
                           where match_id = p_match_id and not voided),
    updated_by  = auth.uid()
  where id = p_match_id
  returning * into v_match;

  perform log_audit(v_match.tournament_id, 'score.undo', 'match', p_match_id,
                    jsonb_build_object('scoreEventId', v_event_id),
                    jsonb_build_object('scoreA', v_score_a, 'scoreB', v_score_b));

  return v_match;
end;
$fn$;

-- ── 종료 — 여기가 '그냥 끝' 이 열리는 자리다 ────────────────────────
create or replace function finish_match(p_match_id uuid, p_winner_side team_side default null)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match   matches;
  v_winner  team_side;
  v_scored  boolean;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not can_run_match(p_match_id) then
    raise exception '이 경기를 종료할 권한이 없습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'live' then
    raise exception '진행 중인 경기가 아닙니다' using errcode = '22023';
  end if;

  -- 점수를 한 번이라도 넣었나. 0:0 이라도 넣었다 지웠으면(voided) 안 센 것이다.
  v_scored := exists (select 1 from score_events
                       where match_id = p_match_id and not voided);

  v_winner := p_winner_side;
  if v_winner is null then
    if v_match.score_a > v_match.score_b then
      v_winner := 'A';
    elsif v_match.score_b > v_match.score_a then
      v_winner := 'B';
    elsif not v_scored and is_session_match(p_match_id) then
      -- 점수를 안 센 모임 경기다. 끝났다는 것만 남긴다.
      v_winner := null;
    else
      -- 점수를 세다가 동점으로 끝났다 → 누가 이겼는지 물어야 한다.
      -- 대회 경기는 이 경로로만 끝난다 (승자 없는 결과는 순위를 망친다).
      raise exception '동점입니다. 승리 팀을 직접 선택해 주세요' using errcode = '22023';
    end if;
  end if;

  update matches set
    status = 'finished', winner_side = v_winner,
    -- 점수를 실제로 넣었는지만 본다. 승자를 손으로 골랐다고 점수를 센 게 되지 않는다
    -- (기권으로 0:0 에 승자만 정한 경기는 '점수 없음' 이 맞다).
    scored = v_scored,
    finished_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  perform log_audit(v_match.tournament_id, 'match.finish_manual', 'match', p_match_id,
                    null, jsonb_build_object('winner', v_winner,
                                             'scored', v_match.scored,
                                             'scoreA', v_match.score_a,
                                             'scoreB', v_match.score_b));
  return v_match;
end;
$fn$;

-- ── 화면이 '점수 없음' 을 그릴 근거를 뷰에 싣는다 ───────────────────
drop view if exists match_overview;
create view match_overview
with (security_invoker = true) as
select
  m.id,
  m.tournament_id,
  m.court_id,
  c.name as court_name,
  m.label,
  m.status,
  m.source,
  m.score_a,
  m.score_b,
  m.winner_side,
  m.scored,
  m.queue_order,
  m.started_at,
  m.finished_at,
  m.edited_at,
  m.created_at,
  ta.group_id   as group_a_id,
  ga.name       as group_a_name,
  ga.is_joker   as group_a_joker,
  ta.target_score as target_a,
  ta.deuce        as deuce_a,
  ta.max_score    as max_a,
  tb.group_id   as group_b_id,
  gb.name       as group_b_name,
  gb.is_joker   as group_b_joker,
  tb.target_score as target_b,
  tb.deuce        as deuce_b,
  tb.max_score    as max_b,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_team_players mtp
     join tournament_members tm on tm.id = mtp.member_id
    where mtp.match_team_id = ta.id) as players_a,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_team_players mtp
     join tournament_members tm on tm.id = mtp.member_id
    where mtp.match_team_id = tb.id) as players_b,
  (select coalesce(array_agg(tm.display_name order by tm.display_name), '{}')
     from match_referees mr
     join tournament_members tm on tm.id = mr.member_id
    where mr.match_id = m.id) as referees
from matches m
left join courts c on c.id = m.court_id
left join match_teams ta on ta.match_id = m.id and ta.side = 'A'
left join groups ga on ga.id = ta.group_id
left join match_teams tb on tb.match_id = m.id and tb.side = 'B'
left join groups gb on gb.id = tb.group_id;

grant select on match_overview to authenticated;
