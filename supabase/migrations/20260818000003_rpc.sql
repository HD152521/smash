-- ════════════════════════════════════════════════════════════════════
-- RPC — 신뢰가 필요한 모든 로직
--
-- RLS 만으로 표현할 수 없는 규칙들이 여기 모인다:
--  · "코드를 아는 사람만 가입"      → RLS 로 불가능 (모르는 대회를 조회해야 함)
--  · "멱등키 검사 + 목표점수 판정"  → 여러 문장이 원자적으로 묶여야 함
--  · "대회가 준비중일 때만 조 변경" → 상태 조건부 컬럼 제한, 정책으로 불가능
-- ════════════════════════════════════════════════════════════════════

-- ── 감사 로그 헬퍼 ──────────────────────────────────────────────────
create or replace function log_audit(
  p_tid uuid, p_action text, p_target_type text,
  p_target_id uuid, p_before jsonb, p_after jsonb
) returns void language sql security definer
set search_path = public, pg_temp as $fn$
  insert into audit_logs (tournament_id, actor_id, action, target_type, target_id, before, after)
  values (p_tid, auth.uid(), p_action, p_target_type, p_target_id, p_before, p_after);
$fn$;

-- ── 초대 코드 생성 ──────────────────────────────────────────────────
-- 헷갈리는 글자(I, L, O, 0, 1)를 뺀 31자 알파벳 × 6자리 = 약 8.8억 조합.
-- 체육관에서 구두로 불러줘도 잘못 받아적을 일이 없어야 한다.
create or replace function gen_invite_code() returns text
language plpgsql volatile as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$fn$;

-- ── 대회 생성 ───────────────────────────────────────────────────────
-- 대회 + 소유자 멤버 + 조 N개를 한 트랜잭션에 만든다.
-- 1조부터 K개가 조커조로 지정된다.
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

  -- 코드 충돌은 사실상 없지만, 없다고 가정하지는 않는다
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
  select
    v_tournament.id, v_uid, 'owner',
    coalesce(nullif(btrim(p_display_name), ''), p.name, '이름없음'),
    p.avatar_url
  from profiles p where p.id = v_uid;

  insert into groups (tournament_id, name, sort_order, is_joker)
  select v_tournament.id, i || '조', i, (i <= p_joker_group_count)
  from generate_series(1, p_group_count) as i;

  perform log_audit(v_tournament.id, 'tournament.create', 'tournament', v_tournament.id,
                    null, to_jsonb(v_tournament));

  return v_tournament;
end;
$fn$;

-- ── 대회 참가 ───────────────────────────────────────────────────────
-- 코드만으로 입장하므로 브루트포스가 실제 위협이다.
-- 10분 내 실패 10회면 잠근다.
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
      using errcode = '53400';
  end if;

  if v_code !~ '^[A-Z0-9]{6}$' then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    raise exception '초대 코드는 6자리입니다' using errcode = '22023';
  end if;

  select * into v_tournament from tournaments where invite_code = v_code;

  if not found then
    insert into join_attempts (user_id, code, succeeded) values (v_uid, v_code, false);
    raise exception '그런 코드의 대회가 없습니다' using errcode = 'P0002';
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

-- ── 내 조 선택/변경 ─────────────────────────────────────────────────
-- 대회가 준비중(draft)일 때만 본인이 바꿀 수 있다.
-- 진행중부터는 관리자만 재배정할 수 있다 (tournament_members UPDATE 정책).
create or replace function set_my_group(p_tournament_id uuid, p_group_id uuid)
returns tournament_members
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_member tournament_members;
  v_status tournament_status;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  select status into v_status from tournaments where id = p_tournament_id;
  if not found then
    raise exception '대회를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  if v_status <> 'draft' and not is_tournament_admin(p_tournament_id) then
    raise exception '대회가 시작된 뒤에는 관리자만 조를 바꿀 수 있습니다' using errcode = '42501';
  end if;

  if p_group_id is not null
     and not exists (select 1 from groups where id = p_group_id and tournament_id = p_tournament_id) then
    raise exception '이 대회의 조가 아닙니다' using errcode = '22023';
  end if;

  update tournament_members
  set group_id = p_group_id
  where tournament_id = p_tournament_id and user_id = v_uid
  returning * into v_member;

  if not found then
    raise exception '이 대회의 참가자가 아닙니다' using errcode = '42501';
  end if;

  return v_member;
end;
$fn$;

-- ── 경기 시작 ───────────────────────────────────────────────────────
create or replace function start_match(p_match_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match matches;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not (is_match_referee(p_match_id) or is_tournament_admin(v_match.tournament_id)) then
    raise exception '이 경기를 시작할 권한이 없습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'scheduled' then
    raise exception '이미 시작했거나 끝난 경기입니다' using errcode = '22023';
  end if;

  update matches
  set status = 'live', started_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  return v_match;
end;
$fn$;

-- ── 득점 기록 ───────────────────────────────────────────────────────
-- 이 앱에서 가장 중요한 함수.
--  · client_event_id 로 멱등 보장 — 같은 요청이 두 번 와도 1점만 오른다
--  · 원장에서 점수를 재계산 — 투영이 원장과 어긋날 수 없다
--  · 팀마다 목표점수가 다르다 (조커 11점 / 일반 21점) — 판정이 비대칭
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
  v_winner   team_side;
begin
  if p_delta not in (1, -1) then
    raise exception '점수 변화량은 +1 또는 -1 만 가능합니다' using errcode = '22023';
  end if;

  -- 두 심판이 동시에 눌러도 순서대로 처리되도록 경기 행을 잠근다
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  if not (is_match_referee(p_match_id) or is_tournament_admin(v_match.tournament_id)) then
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
    -- 이미 반영된 요청이다. 재전송이므로 현재 상태만 돌려주고 끝낸다.
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
    max(target_score) filter (where side = 'B')
  into v_target_a, v_target_b
  from match_teams where match_id = p_match_id;

  if v_target_a is null or v_target_b is null then
    raise exception '양 팀이 편성되지 않은 경기입니다' using errcode = '22023';
  end if;

  -- 듀스가 없으므로 목표 점수에 닿는 순간 끝난다. 팀마다 목표가 다르다.
  if v_score_a >= v_target_a then
    v_winner := 'A';
  elsif v_score_b >= v_target_b then
    v_winner := 'B';
  end if;

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

-- ── 득점 취소 ───────────────────────────────────────────────────────
-- 심판이 잘못 누르는 건 상수다. 마지막 유효 이벤트를 무효화한다.
-- 마지막 한 점이 경기를 끝내버린 경우도 되돌릴 수 있어야 하므로,
-- 종료 직후 2분간은 심판도 취소할 수 있다. 그 뒤에는 관리자만.
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
  v_winner    team_side;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;

  v_is_admin := is_tournament_admin(v_match.tournament_id);

  if not (is_match_referee(p_match_id) or v_is_admin) then
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
    max(target_score) filter (where side = 'B')
  into v_target_a, v_target_b
  from match_teams where match_id = p_match_id;

  -- 되돌린 결과가 아직도 종료 조건을 만족하면 종료 상태를 유지한다
  if v_score_a >= v_target_a then
    v_winner := 'A';
  elsif v_score_b >= v_target_b then
    v_winner := 'B';
  end if;

  update matches set
    score_a     = v_score_a,
    score_b     = v_score_b,
    status      = case when v_winner is not null then 'finished'::match_status else 'live'::match_status end,
    winner_side = v_winner,
    finished_at = case when v_winner is not null then finished_at else null end,
    updated_by  = auth.uid()
  where id = p_match_id
  returning * into v_match;

  perform log_audit(v_match.tournament_id, 'score.undo', 'match', p_match_id,
                    jsonb_build_object('scoreEventId', v_event_id),
                    jsonb_build_object('scoreA', v_score_a, 'scoreB', v_score_b));

  return v_match;
end;
$fn$;

-- ── 경기 수동 종료 ──────────────────────────────────────────────────
-- 목표 점수에 닿기 전에 끝내야 할 때 (기권, 시간 초과 등).
create or replace function finish_match(p_match_id uuid, p_winner_side team_side default null)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match  matches;
  v_winner team_side;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not (is_match_referee(p_match_id) or is_tournament_admin(v_match.tournament_id)) then
    raise exception '이 경기를 종료할 권한이 없습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'live' then
    raise exception '진행 중인 경기가 아닙니다' using errcode = '22023';
  end if;

  v_winner := p_winner_side;
  if v_winner is null then
    if v_match.score_a > v_match.score_b then
      v_winner := 'A';
    elsif v_match.score_b > v_match.score_a then
      v_winner := 'B';
    else
      raise exception '동점입니다. 승리 팀을 직접 선택해 주세요' using errcode = '22023';
    end if;
  end if;

  update matches set
    status = 'finished', winner_side = v_winner,
    finished_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  perform log_audit(v_match.tournament_id, 'match.finish_manual', 'match', p_match_id,
                    null, jsonb_build_object('winner', v_winner,
                                             'scoreA', v_match.score_a,
                                             'scoreB', v_match.score_b));
  return v_match;
end;
$fn$;

-- ── 경기 재개 (관리자 전용) ─────────────────────────────────────────
create or replace function reopen_match(p_match_id uuid)
returns matches
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_match  matches;
  v_before jsonb;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception '경기를 찾을 수 없습니다' using errcode = 'P0002';
  end if;
  if not is_tournament_admin(v_match.tournament_id) then
    raise exception '관리자만 경기를 다시 열 수 있습니다' using errcode = '42501';
  end if;
  if v_match.status <> 'finished' then
    raise exception '종료된 경기가 아닙니다' using errcode = '22023';
  end if;

  v_before := to_jsonb(v_match);

  update matches set
    status = 'live', winner_side = null, finished_at = null,
    edited_at = now(), updated_by = auth.uid()
  where id = p_match_id
  returning * into v_match;

  perform log_audit(v_match.tournament_id, 'match.reopen', 'match', p_match_id,
                    v_before, to_jsonb(v_match));
  return v_match;
end;
$fn$;

-- ── 권한 부여 ───────────────────────────────────────────────────────
revoke all on function log_audit(uuid, text, text, uuid, jsonb, jsonb) from public;
revoke all on function gen_invite_code() from public;

revoke all on function create_tournament(text, text, int, int, text, int, int) from public;
revoke all on function join_tournament(text, text)                             from public;
revoke all on function set_my_group(uuid, uuid)                                from public;
revoke all on function start_match(uuid)                                       from public;
revoke all on function record_score(uuid, team_side, int, text)                from public;
revoke all on function undo_score(uuid)                                        from public;
revoke all on function finish_match(uuid, team_side)                           from public;
revoke all on function reopen_match(uuid)                                      from public;

grant execute on function create_tournament(text, text, int, int, text, int, int) to authenticated;
grant execute on function join_tournament(text, text)                             to authenticated;
grant execute on function set_my_group(uuid, uuid)                                to authenticated;
grant execute on function start_match(uuid)                                       to authenticated;
grant execute on function record_score(uuid, team_side, int, text)                to authenticated;
grant execute on function undo_score(uuid)                                        to authenticated;
grant execute on function finish_match(uuid, team_side)                           to authenticated;
grant execute on function reopen_match(uuid)                                      to authenticated;
