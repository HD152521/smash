-- ════════════════════════════════════════════════════════════════════
-- 배드민턴 대회 웹앱 — 기본 스키마
--
-- 설계 원칙
--  1. 점수는 score_events(원장)에 append 하고 matches.score_a/b 로 투영한다.
--     원장은 감사·되돌리기용, 투영은 Realtime 구독용.
--  2. 경기 규칙(목표점수·승점)은 match_teams 에 스냅샷으로 굳힌다.
--     대회 도중 조커 설정을 바꿔도 지난 결과가 소급 변조되지 않는다.
--  3. 파생 가능한 값은 컬럼으로 두지 않는다 (코트 사용중 여부 등).
-- ════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── 열거형 ──────────────────────────────────────────────────────────
create type tournament_status as enum ('draft', 'live', 'finished');
create type member_role       as enum ('owner', 'admin', 'member');
create type match_status      as enum ('scheduled', 'live', 'finished', 'void');
create type match_source      as enum ('live', 'manual');
create type team_side         as enum ('A', 'B');

-- ── 공통 트리거 ─────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

-- ── profiles ────────────────────────────────────────────────────────
-- auth.users 의 앱측 확장. 카카오는 이메일을 주지 않을 수 있으므로
-- 이메일에 의존하지 않는다 (nullable, unique 아님).
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default '이름없음',
  email       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- 소셜 provider 마다 메타데이터 키가 다르다. 널리 쓰이는 키를 순서대로 훑는다.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  insert into profiles (id, name, email, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'nickname', ''),
      nullif(new.raw_user_meta_data->>'preferred_username', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '이름없음'
    ),
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url', ''),
      nullif(new.raw_user_meta_data->>'picture', '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── tournaments ─────────────────────────────────────────────────────
create table tournaments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 1 and 60),
  description  text check (length(description) <= 500),
  invite_code  text not null unique check (invite_code ~ '^[A-Z0-9]{6}$'),
  owner_id     uuid not null references auth.users(id) on delete restrict,
  status       tournament_status not null default 'draft',
  -- { format, normalPoints, jokerPoints, deuce, winPoints, jokerWinPoints, lossPoints, jokerGroupCount }
  config       jsonb not null default jsonb_build_object(
                 'format',          'doubles',
                 'normalPoints',    21,
                 'jokerPoints',     11,
                 'deuce',           false,
                 'winPoints',       1.0,
                 'jokerWinPoints',  0.5,
                 'lossPoints',      0,
                 'jokerGroupCount', 0
               ),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tournaments_owner_idx on tournaments(owner_id);
create trigger tournaments_updated_at before update on tournaments
  for each row execute function set_updated_at();

-- ── groups (조) ─────────────────────────────────────────────────────
-- is_joker 는 대회 생성 시 1조부터 K개까지 자동 지정된다.
-- capacity 는 소프트 정원 — 초과해도 막지 않고 UI 경고만 띄운다.
create table groups (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  name           text not null check (length(btrim(name)) between 1 and 20),
  sort_order     int  not null,
  is_joker       boolean not null default false,
  capacity       int  not null default 4 check (capacity between 1 and 20),
  created_at     timestamptz not null default now(),
  unique (tournament_id, sort_order)
);
create index groups_tournament_idx on groups(tournament_id, sort_order);

-- ── tournament_members ──────────────────────────────────────────────
-- display_name / avatar_url 을 여기에 스냅샷으로 둔다.
-- 덕분에 profiles 를 완전히 비공개로 유지할 수 있다 (RLS: 본인만 조회).
create table tournament_members (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  group_id       uuid references groups(id) on delete set null,
  role           member_role not null default 'member',
  display_name   text not null check (length(btrim(display_name)) between 1 and 20),
  avatar_url     text,
  joined_at      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tournament_id, user_id)
);
create index tm_tournament_idx on tournament_members(tournament_id);
create index tm_user_idx       on tournament_members(user_id);
create index tm_group_idx      on tournament_members(group_id);
create trigger tm_updated_at before update on tournament_members
  for each row execute function set_updated_at();

-- ── courts ──────────────────────────────────────────────────────────
-- 사용중 여부는 matches 에서 파생한다 (status='live' and court_id=...).
create table courts (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  name           text not null check (length(btrim(name)) between 1 and 20),
  sort_order     int not null,
  created_at     timestamptz not null default now(),
  unique (tournament_id, sort_order)
);
create index courts_tournament_idx on courts(tournament_id, sort_order);

-- ── matches ─────────────────────────────────────────────────────────
create table matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  court_id       uuid references courts(id) on delete set null,
  label          text check (length(label) <= 40),
  status         match_status not null default 'scheduled',
  source         match_source not null default 'live',
  score_a        int not null default 0 check (score_a >= 0),  -- ★ Realtime 구독 대상
  score_b        int not null default 0 check (score_b >= 0),
  winner_side    team_side,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  updated_by     uuid references auth.users(id) on delete set null,
  edited_at      timestamptz,   -- 관리자가 결과를 손댄 시각. UI "수정됨" 배지 근거
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- 끝난 경기는 승자가 반드시 있어야 하고, 안 끝난 경기는 승자가 없어야 한다
  constraint winner_only_when_finished check (
    (status = 'finished' and winner_side is not null) or
    (status <> 'finished' and winner_side is null)
  )
);
create index matches_tournament_idx on matches(tournament_id, status);
create index matches_court_live_idx on matches(court_id) where status = 'live';
create trigger matches_updated_at before update on matches
  for each row execute function set_updated_at();

-- ── match_teams ─────────────────────────────────────────────────────
-- target_score / win_points 는 편성 시점의 조 설정을 굳힌 스냅샷이다.
-- 대회 도중 조커 구성이 바뀌어도 지난 경기 결과와 순위가 흔들리지 않는다.
create table match_teams (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references matches(id) on delete cascade,
  side          team_side not null,
  group_id      uuid not null references groups(id) on delete restrict,
  target_score  int not null check (target_score between 1 and 99),
  win_points    numeric(3,1) not null check (win_points >= 0),
  is_joker      boolean not null default false,
  unique (match_id, side)
);
create index mt_match_idx on match_teams(match_id);
create index mt_group_idx on match_teams(group_id);

-- ── match_team_players (복식이면 2행) ───────────────────────────────
create table match_team_players (
  match_team_id  uuid not null references match_teams(id) on delete cascade,
  member_id      uuid not null references tournament_members(id) on delete cascade,
  primary key (match_team_id, member_id)
);
create index mtp_member_idx on match_team_players(member_id);

-- ── match_referees (경기 단위 채점 권한) ────────────────────────────
create table match_referees (
  match_id   uuid not null references matches(id) on delete cascade,
  member_id  uuid not null references tournament_members(id) on delete cascade,
  primary key (match_id, member_id)
);
create index mr_member_idx on match_referees(member_id);

-- ── score_events (append-only 원장) ─────────────────────────────────
-- client_event_id 는 클라이언트가 생성하는 멱등키.
-- 체육관 와이파이에서 같은 요청이 두 번 도착해도 점수는 한 번만 오른다.
create table score_events (
  id               bigint generated always as identity primary key,
  match_id         uuid not null references matches(id) on delete cascade,
  side             team_side not null,
  delta            int not null check (delta in (1, -1)),
  client_event_id  text not null unique check (length(client_event_id) between 8 and 64),
  voided           boolean not null default false,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index se_match_idx on score_events(match_id, id desc);
create index se_match_active_idx on score_events(match_id) where voided = false;

-- ── audit_logs ──────────────────────────────────────────────────────
create table audit_logs (
  id             bigint generated always as identity primary key,
  tournament_id  uuid not null references tournaments(id) on delete cascade,
  actor_id       uuid references auth.users(id) on delete set null,
  action         text not null,
  target_type    text not null,
  target_id      uuid,
  before         jsonb,
  after          jsonb,
  created_at     timestamptz not null default now()
);
create index audit_tournament_idx on audit_logs(tournament_id, created_at desc);

-- ── join_attempts (초대코드 브루트포스 차단 근거) ───────────────────
create table join_attempts (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  code          text not null,
  succeeded     boolean not null,
  attempted_at  timestamptz not null default now()
);
create index join_attempts_user_idx on join_attempts(user_id, attempted_at desc);
