-- ════════════════════════════════════════════════════════════════════
-- 회비 장부의 두 구멍 — 「빼기」가 지우기였던 것과, 같은 사람이 두 줄이 되는 것
--
-- 20260903000002 는 원장의 성질을 제대로 골랐다(설계 판단 5: 사람이 나가도
-- 원장은 남는다). 그런데 그 원장에 **행을 통째로 지우는 문 하나**를 열어
-- 뒀고, 문 옆에 붙은 안내문은 그 문이 하는 일과 달랐다. 이 마이그레이션은
-- 그 문을 고친다.
--
-- ── 🟠 하나: 「빼기」가 낸 사람까지 지웠다 ───────────────────────────
--
-- remove_dues_entry 는 paid_on 을 안 봤다. 그래서 30,000원을 낸 사람을
-- 빼면 **걷힌 돈에서도 30,000원이 사라졌다.** 확인창은 "걷을 돈 합계에서도
-- 빠집니다" 만 말했으므로, 총무는 걷힌 돈이 줄어든 것을 모른 채 넘어간다.
-- 그리고 화면이 안내한 복구(«빠진 사람 채우기» = open_dues_month)는
-- club_members 를 돌며 **새 행을 만드는** 함수다. 그 사람의 금액도, 입금일도
-- 안 돌아오고(그 달 최빈값으로 새로 만들어진다), 이미 명단에서 나간
-- 사람이면 club_members 에 없으니 **영영 못 만든다.**
--
-- 여기서 갈라야 할 것은 두 가지 다른 일이다.
--
--   · **잘못 넣은 사람을 빼는 일** — 휴회·중간 탈퇴처럼 이 달에 받을 것이
--     없다. 돈은 오간 적이 없다. 이것은 정당한 동작이다.
--   · **들어온 돈의 기록을 지우는 일** — 통장에 찍힌 사실을 없애는 것이다.
--     이건 「빼기」가 아니라 **납부 되돌리기**(set_dues_paid false)의 몫이고,
--     그 길은 이미 있고 감사로그도 남는다.
--
-- 그래서 이 마이그레이션은 **낸 사람을 못 빼게** 한다. 빼려면 총무가 먼저
-- 납부를 되돌려야 한다 — 두 번의 동작이지만, 그 두 번이 각각 무엇을 지우는지
-- 총무가 안다. 한 번에 둘 다 지우는 문은 "무엇이 사라졌는지 모르는 문" 이다.
--
-- 그리고 「빼기」 자체를 **지우기에서 표시로** 바꾼다(removed_at). 이 원장의
-- 대전제가 "돈 기록은 반드시 틀리고, 되돌릴 수 없으면 총무가 앱을 안 믿는다"
-- (설계 판단 4) 인데, 유독 빼기만 편도였다. 행이 남아 있으면 되돌리기는
-- 금액·메모·입금일·나간 사람 여부까지 **그대로** 살아난다. 감사로그의 before
-- 스냅샷은 되돌리기가 아니다 — 총무는 SQL 을 안 친다.
--
-- ⚠ 뺀 행은 남지만 **합계에는 안 든다.** club_dues_summary 가 걷을 돈·걷힌
--   돈을 낼 때 removed_at is null 만 센다. 화면(src/lib/dues.ts)도 같은
--   규칙으로 더한다 — 두 곳이 다르면 총무는 어느 쪽이 맞는지 알 수 없다.
--
-- ── 🟠 둘: 탈퇴 후 재가입하면 같은 달에 두 줄 ────────────────────────
--
-- unique (member_id, period_month) 는 member_id 가 null 인 순간 힘을 잃는다.
-- 포스트그레스에서 null 은 서로 같지 않기 때문이다. 그 성질은 **의도된 것**
-- 이다 — 나간 사람들의 고아 행이 서로 안 부딪히게 하려고 골랐다. 문제는
-- 같은 성질이 "나간 사람의 고아 행" 과 "그 사람이 재가입해 새로 생긴 행" 도
-- 안 부딪히게 만든다는 것이다. 12명인데 걷을 돈이 13명분이 되고, 한쪽을
-- 납부 처리해도 다른 쪽은 영원히 미납으로 남는다.
--
-- ⚠ 이름으로 맞추면 안 된다. 동명이인이 있고, 이 저장소는 게스트 이름에
--   글자를 붙여 구분한다(20260828000001 의 '홍길동A'). 이름은 열쇠가 아니다.
--
-- 그래서 **member_user_id 스냅샷**을 둔다. club_members 는 unique(club_id,
-- user_id) 라 계정 하나당 명단 행이 하나뿐이므로, user_id 는 재가입을 건너
-- 같은 사람을 가리키는 유일하게 안전한 열쇠다. 두 겹으로 막는다:
--
--   1) 부분 unique 인덱스 (club_id, member_user_id, period_month)
--      — 어떤 경로로 들어와도 같은 달에 두 줄이 못 생긴다. 코드가 아니라
--        표가 지킨다.
--   2) open_dues_month 의 **재입양** — 재가입한 사람의 고아 행에 새 명단
--      행을 다시 붙인다. 인덱스만 있으면 두 줄은 안 생기지만 member_id 가
--      null 로 남아, club_dues_summary 의 '본인 행' 이 그 사람에게 안 간다
--      (그 조회가 club_members 를 조인하기 때문이다).
--
-- 🔴 대가: **계정 없는 회원(user_id is null)은 이 열쇠가 없다.** 명단에서
--    뺐다가 다시 넣으면 그 사람은 같은 달에 두 줄이 될 수 있다. 이 앱에는
--    계정 없는 사람을 재가입 너머로 잇는 식별자가 **아예 없고**, 이름으로
--    잇는 것은 동명이인 때문에 더 나쁜 오류다. 그래서 못 막는 것을 못 막는
--    다고 적어 둔다 — 나중에 명단에 연락처가 생기면 그때 열쇠가 하나 는다.
--
-- ── 🔴 안 건드린 것: 지난 달의 고아 행 ──────────────────────────────
--
-- 나간 사람의 지난 달 행은 그대로 둔다. 지우거나 cascade 로 바꾸면 지난 9월의
-- "39만원 걷힘" 이 조용히 36만원이 된다 — 설계 판단 5 가 막으려던 바로 그것.
-- 합계 쿼리는 여전히 club_members 를 **조인하지 않는다.** 재입양도 금액과
-- paid_on 은 한 글자도 안 만지므로 지난 달 합계는 흔들리지 않는다.
--
-- 다만 재입양이 member_name 을 새로 고치는 것은 **이번 달(과 앞으로의 달)
-- 에서만** 한다. 지난 달의 이름 스냅샷은 그때의 사실이라 덮으면 안 된다.
--
-- ── 곁다리: paid_on 의 기본값이 UTC 였다 ────────────────────────────
--
-- 이 DB 의 세션 타임존은 UTC 다(`show timezone` → UTC 로 실측). 그런데 화면의
-- 달 판정은 로컬(KST)이다(src/lib/dues.ts 의 monthKeyOf). 그래서 KST 로 9월 1일
-- 아침 8시에 체크하면 서버의 current_date 는 **8월 31일** 이고, 9월 장부의
-- 행에 8월 날짜가 찍힌다. 총무가 통장과 맞춰볼 때 하루가 어긋나고, 하필
-- 1일 아침이면 전달로 읽힌다.
-- 이 앱의 날짜 판단은 전부 기기 시간대다(vite.config.ts 가 테스트 TZ 를
-- Asia/Seoul 로 못 박은 것과 src/lib/shareCard.ts 가 같은 말을 한다).
-- 그래서 두 겹으로 맞춘다: 화면이 자기 오늘을 p_paid_on 으로 보내고,
-- 서버의 기본값도 UTC 가 아니라 KST 의 오늘로 둔다.
-- ════════════════════════════════════════════════════════════════════

-- ── 컬럼 둘 ─────────────────────────────────────────────────────────
alter table club_dues add column removed_at timestamptz;

-- 재가입을 건너 같은 사람을 가리키는 열쇠. **FK 를 안 건다** — auth.users 가
-- 지워질 때 set null 이면 열쇠가 조용히 사라지고, cascade 면 원장이 사라진다.
-- member_name 과 같은 성질의 **스냅샷**이다 (그때 그 행이 누구의 것이었나).
alter table club_dues add column member_user_id uuid;

comment on column club_dues.removed_at is
  '이 달 회비에서 뺀 시각. null 이면 살아 있는 행. 지우지 않고 표시만 하는 '
  '이유는 잘못 뺐을 때 금액·메모·입금일을 그대로 되살리기 위해서다 — '
  '합계(club_dues_summary)는 이 값이 null 인 행만 센다.';

comment on column club_dues.member_user_id is
  'club_members.user_id 의 스냅샷. 탈퇴 후 재가입하면 club_members.id 가 새로 '
  '나므로 member_id 로는 같은 사람을 못 잇는다. 이름은 동명이인 때문에 열쇠가 '
  '못 된다. 계정 없는 회원은 null 이고, 그 사람은 이 보호를 못 받는다.';

-- 이미 있는 행에 열쇠를 채운다 (이 기능은 아직 아무도 안 썼으므로 사실상
-- 0행이지만, 마이그레이션은 데이터가 있다고 가정하고 쓴다).
update club_dues d
   set member_user_id = cm.user_id
  from club_members cm
 where cm.id = d.member_id
   and d.member_user_id is null;

-- ── 표가 지키는 불변식 ──────────────────────────────────────────────
-- 코드가 아니라 인덱스가 막는다. 나중에 누가 insert 경로를 하나 더 만들어도
-- 같은 사람이 같은 달에 두 줄이 될 수 없다.
-- ⚠ 뺀 행(removed_at)도 이 인덱스에 든다. 그래야 「뺀 사람」이 «빠진 사람
--   채우기» 로 조용히 되살아나지 않는다 — 되살리는 길은 restore_dues_entry
--   하나이고, 그 길은 화면에 보인다.
create unique index cd_user_period_uniq
  on club_dues (club_id, member_user_id, period_month)
  where member_user_id is not null;

-- ════════════════════════════════════════════════════════════════════
-- 회원용 창구 — 뺀 행은 합계에 안 든다
-- ════════════════════════════════════════════════════════════════════
-- 🔴 돌려주는 것은 그대로다: 합계 둘 + 호출자 본인 행. 필드를 하나도 안
--    늘렸다. 늘리는 것이 곧 노출 표면을 넓히는 것이다.
create or replace function club_dues_summary(p_club_id uuid, p_period date)
returns jsonb
language plpgsql security definer stable
set search_path = public, pg_temp as $fn$
declare
  v_period    date;
  v_expected  bigint;
  v_collected bigint;
  v_mine      club_dues;
begin
  if not is_club_member(p_club_id) then
    raise exception '동아리 회원만 볼 수 있습니다' using errcode = '42501';
  end if;

  v_period := date_trunc('month', coalesce(p_period, current_date))::date;

  -- removed_at is null: 뺀 사람은 걷을 돈에도 걷힌 돈에도 안 든다.
  -- ⚠ 낸 사람은 애초에 못 빼지만(remove_dues_entry 가 거절한다), 그래도
  --   걷힌 돈 쪽에도 같은 조건을 건다 — 두 조건이 어긋나면 "걷힌 돈이 걷을
  --   돈보다 큰" 장부가 나온다.
  select coalesce(sum(amount), 0),
         coalesce(sum(amount) filter (where paid_on is not null), 0)
    into v_expected, v_collected
    from club_dues
   where club_id = p_club_id and period_month = v_period
     and removed_at is null;

  select d.* into v_mine
    from club_dues d
    join club_members cm on cm.id = d.member_id
   where d.club_id = p_club_id
     and d.period_month = v_period
     and d.removed_at is null
     and cm.user_id = auth.uid();

  return jsonb_build_object(
    'period_month',    v_period,
    'expected_total',  v_expected,
    'collected_total', v_collected,
    'mine', case when v_mine.id is null then null
                 else jsonb_build_object('id',      v_mine.id,
                                         'amount',  v_mine.amount,
                                         'paid_on', v_mine.paid_on)
            end
  );
end;
$fn$;

-- ════════════════════════════════════════════════════════════════════
-- 달 열기 — 채우기 전에 **재입양**부터 한다
-- ════════════════════════════════════════════════════════════════════
create or replace function open_dues_month(
  p_club_id uuid, p_period date, p_amount integer
) returns integer
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_period   date;
  v_created  integer;
  v_adopted  integer;
  v_is_past  boolean;
begin
  if not is_club_admin(p_club_id) then
    raise exception '운영진만 회비 장부를 열 수 있습니다' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 10000000 then
    raise exception '금액이 올바르지 않습니다' using errcode = '22023';
  end if;

  v_period := date_trunc('month', coalesce(p_period, current_date))::date;
  -- 지난 달의 이름 스냅샷은 그때의 사실이라 안 덮는다 (아래 재입양에서 쓴다).
  v_is_past := v_period < date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;

  -- ── 재입양 ────────────────────────────────────────────────────────
  -- 나갔다 돌아온 사람의 고아 행에 새 명단 행을 다시 붙인다. 이걸 안 하면
  -- 아래 insert 가 부분 unique 인덱스에 막혀 조용히 아무 일도 안 일어나고,
  -- 그 사람은 자기 회비 줄을 영영 못 본다(club_dues_summary 의 '본인 행' 이
  -- member_id 로 club_members 를 조인한다).
  -- ⚠ 금액·paid_on 은 한 글자도 안 만진다. 지난 달 합계가 안 흔들리는 이유다.
  update club_dues d
     set member_id   = cm.id,
         member_name = case when v_is_past then d.member_name else cm.display_name end,
         updated_at  = now()
    from club_members cm
   where d.club_id       = p_club_id
     and d.period_month  = v_period
     and d.member_id     is null
     and d.member_user_id is not null
     and cm.club_id      = p_club_id
     and cm.user_id      = d.member_user_id
     -- 그 사람의 살아 있는 행이 따로 이미 있으면 건드리지 않는다.
     -- (부분 인덱스가 생기기 전에 만들어진 중복이 남아 있을 수 있다 —
     --  여기서 unique 위반으로 달 열기 전체가 죽으면 총무가 손 쓸 길이 없다.)
     and not exists (select 1 from club_dues x
                      where x.member_id = cm.id and x.period_month = v_period);
  get diagnostics v_adopted = row_count;

  -- ── 채우기 ────────────────────────────────────────────────────────
  -- on conflict 에 대상을 안 적는다 — unique(member_id, period_month) 와
  -- 부분 인덱스 cd_user_period_uniq **둘 다** 걸러야 하기 때문이다.
  insert into club_dues (club_id, member_id, member_user_id, member_name, period_month, amount)
  select p_club_id, cm.id, cm.user_id, cm.display_name, v_period, p_amount
    from club_members cm
   where cm.club_id = p_club_id
  on conflict do nothing;

  get diagnostics v_created = row_count;

  if v_created > 0 or v_adopted > 0 then
    perform log_audit_club(p_club_id, 'club_dues.open', 'club_dues', null, null,
                           jsonb_build_object('period_month', v_period,
                                              'amount',       p_amount,
                                              'created',      v_created,
                                              'adopted',      v_adopted));
  end if;

  -- 돌려주는 것은 **새로 만든 행 수**다. 재입양은 사람을 넣은 것이 아니라
  -- 원래 있던 줄을 다시 이은 것이라 "N명을 넣었습니다" 에 섞으면 거짓말이 된다.
  return v_created;
end;
$fn$;

comment on function open_dues_month(uuid, date, integer) is
  '그 달의 회비 행을 회원 전원에게 만든다. 재실행 안전 — 이미 있는 행의 금액은 '
  '덮어쓰지 않는다. 채우기 전에 재가입자의 고아 행을 다시 잇는다(재입양). '
  '뺀 사람(removed_at)은 여기서 안 살아난다 — restore_dues_entry 가 그 길이다.';

-- ════════════════════════════════════════════════════════════════════
-- 납부 체크 — 기본 입금일이 UTC 가 아니라 KST 의 오늘이다
-- ════════════════════════════════════════════════════════════════════
create or replace function set_dues_paid(
  p_dues_id uuid, p_paid boolean, p_paid_on date default null
) returns club_dues
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_row    club_dues;
  v_before jsonb;
  v_next   date;
begin
  select * into v_row from club_dues where id = p_dues_id for update;
  if not found then
    raise exception '회비 항목을 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(v_row.club_id) then
    raise exception '운영진만 납부를 체크할 수 있습니다' using errcode = '42501';
  end if;

  -- 뺀 행은 이 달에 받을 것이 없다고 총무가 표시한 행이다. 거기에 납부를
  -- 찍으면 합계에는 안 들어가면서 paid_on 만 남아, 되돌렸을 때 갑자기
  -- 걷힌 돈이 뛴다. 먼저 되돌려 놓고 체크하라고 말한다.
  if v_row.removed_at is not null then
    raise exception '이 달 회비에서 뺀 사람입니다. 먼저 다시 넣어 주세요'
      using errcode = 'PT409';
  end if;

  -- 기본값이 UTC 의 오늘이면 KST 아침 체크가 전날로 찍힌다 (머리 주석 참고).
  v_next := case when coalesce(p_paid, false)
                 then coalesce(p_paid_on, (now() at time zone 'Asia/Seoul')::date)
                 else null end;

  if v_next is not distinct from v_row.paid_on then
    return v_row;
  end if;

  v_before := to_jsonb(v_row);
  update club_dues set paid_on = v_next, updated_at = now()
   where id = p_dues_id
  returning * into v_row;

  perform log_audit_club(v_row.club_id,
                         case when v_next is null then 'club_dues.unpaid'
                              else 'club_dues.paid' end,
                         'club_dues', p_dues_id, v_before, to_jsonb(v_row));
  return v_row;
end;
$fn$;

comment on function set_dues_paid(uuid, boolean, date) is
  '납부 체크와 되돌리기. p_paid=false 면 paid_on 을 지운다. 양방향인 것이 '
  '핵심이다 — 되돌릴 수 없으면 총무가 앱을 안 믿는다. 양쪽 다 감사로그에 남는다. '
  'p_paid_on 을 안 주면 KST 의 오늘 — DB 세션 타임존은 UTC 라 그냥 두면 하루 밀린다.';

-- ════════════════════════════════════════════════════════════════════
-- 빼기 / 다시 넣기 — 편도였던 문을 왕복으로 바꾼다
-- ════════════════════════════════════════════════════════════════════
create or replace function remove_dues_entry(p_dues_id uuid)
returns void
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_row    club_dues;
  v_before jsonb;
begin
  select * into v_row from club_dues where id = p_dues_id for update;
  if not found then
    raise exception '회비 항목을 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(v_row.club_id) then
    raise exception '운영진만 항목을 뺄 수 있습니다' using errcode = '42501';
  end if;

  -- 🔴 낸 사람은 못 뺀다. 통장에 들어온 사실을 지우는 것은 「빼기」가 아니라
  --    납부 되돌리기의 몫이고, 그 길은 이미 있다(set_dues_paid false).
  --    한 번의 확인창으로 둘 다 지우면 총무는 걷힌 돈이 줄어든 것을 모른다.
  if v_row.paid_on is not null then
    raise exception '낸 사람은 뺄 수 없습니다. 납부를 먼저 되돌려 주세요'
      using errcode = 'PT409';
  end if;

  -- 이미 뺀 행이면 아무 일도 안 한다. "안 바뀐 변경" 을 감사로그에 남기면
  -- 나중에 로그를 읽는 사람이 진짜 변경을 못 찾는다.
  if v_row.removed_at is not null then
    return;
  end if;

  v_before := to_jsonb(v_row);
  update club_dues set removed_at = now(), updated_at = now()
   where id = p_dues_id
  returning * into v_row;

  perform log_audit_club(v_row.club_id, 'club_dues.remove', 'club_dues',
                         p_dues_id, v_before, to_jsonb(v_row));
end;
$fn$;

comment on function remove_dues_entry(uuid) is
  '이 달에 받을 것이 없는 사람을 걷을 돈에서 뺀다. 행을 지우지 않고 removed_at 만 '
  '찍으므로 restore_dues_entry 로 금액·메모까지 그대로 되돌릴 수 있다. '
  '🔴 낸 사람은 거절한다 — 그건 납부 되돌리기가 할 일이다.';

-- 되돌리기. 새로 만드는 것이 아니라 **그 행을 살린다.** 그래서 총무가 손으로
-- 고친 금액도, 메모도, 이미 명단에서 나간 사람이라는 사실(member_id is null)
-- 도 그대로다. open_dues_month 로는 이 중 어느 것도 못 되살린다.
create or replace function restore_dues_entry(p_dues_id uuid)
returns club_dues
language plpgsql security definer
set search_path = public, pg_temp as $fn$
declare
  v_row    club_dues;
  v_before jsonb;
begin
  select * into v_row from club_dues where id = p_dues_id for update;
  if not found then
    raise exception '회비 항목을 찾을 수 없습니다' using errcode = 'PT404';
  end if;
  if not is_club_admin(v_row.club_id) then
    raise exception '운영진만 항목을 되돌릴 수 있습니다' using errcode = '42501';
  end if;

  if v_row.removed_at is null then
    return v_row;
  end if;

  v_before := to_jsonb(v_row);
  update club_dues set removed_at = null, updated_at = now()
   where id = p_dues_id
  returning * into v_row;

  perform log_audit_club(v_row.club_id, 'club_dues.restore', 'club_dues',
                         p_dues_id, v_before, to_jsonb(v_row));
  return v_row;
end;
$fn$;

comment on function restore_dues_entry(uuid) is
  '뺀 사람을 이 달 회비에 다시 넣는다. 그 행을 살리는 것이라 금액·메모·나간 '
  '사람 여부가 그대로 돌아온다 — open_dues_month 는 새 행을 만들 뿐이라 '
  '그 달 최빈값으로 덮이고, 명단에 없는 사람은 아예 못 만든다.';

-- ── 권한 ────────────────────────────────────────────────────────────
-- anon 은 회비를 볼 일이 없다. verify-schema 가 anon 실행 가능 함수를
-- **집합**으로 못 박아 두었으므로, 여기서 새면 db:verify 가 잡는다.
revoke all on function restore_dues_entry(uuid) from public, anon;
grant execute on function restore_dues_entry(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- 이 마이그레이션이 바꾼 것
--   · club_dues.removed_at      — 「빼기」가 지우기에서 표시로 바뀌었다
--   · club_dues.member_user_id  — 재가입을 건너 같은 사람을 잇는 열쇠
--   · cd_user_period_uniq       — 같은 달에 같은 사람이 두 줄이 못 된다
--   · remove_dues_entry         — 낸 사람은 거절. 지우지 않고 표시만 한다
--   · restore_dues_entry (신설) — 진짜 되돌리기. 그 행을 살린다
--   · open_dues_month           — 채우기 전에 재가입자의 고아 행을 재입양
--   · club_dues_summary         — 뺀 행은 합계에 안 든다
--   · set_dues_paid             — 기본 입금일이 UTC 가 아니라 KST 의 오늘
--   안 바꾼 것: RLS(운영진 전용 select 하나), 지난 달 고아 행, 합계가
--   club_members 를 조인하지 않는다는 성질.
-- ════════════════════════════════════════════════════════════════════
