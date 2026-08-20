-- ════════════════════════════════════════════════════════════════════
-- 경기 삭제는 '아직 시작 안 한 것' 만
--
-- 지금 가드는 score_events 가 있으면 막는다. 그런데 수동 기록
-- (record_manual_match) 은 이미 끝난 경기의 결과만 넣는 것이라
-- score_events 가 하나도 없다. 그래서 끝난 경기인데도 그냥 지워진다.
-- 순위에 반영된 결과가 흔적 없이 사라지는데 오류도 안 뜬다.
--
-- 끝난 경기를 없던 일로 하려면 무효 처리(void_match)가 맞다.
-- 그건 점수와 출전 기록을 남기고 순위에서만 뺀다.
--
-- 편성만 해두고 필요 없어진 경기는 그냥 지우는 게 자연스럽다.
-- 기록에 '무효' 로 남을 이유가 없다 — 애초에 아무 일도 없었다.
-- ════════════════════════════════════════════════════════════════════

create or replace function guard_match_delete()
returns trigger language plpgsql as $fn$
begin
  if not is_direct_api_call() then
    return old;
  end if;

  if old.status <> 'scheduled' then
    raise exception '시작했거나 끝난 경기는 지울 수 없습니다. 무효 처리를 해주세요'
      using errcode = '42501';
  end if;

  -- status 가 scheduled 면 점수가 있을 수 없지만, 원장이 남아 있다면
  -- 상태가 어긋난 것이므로 지우지 않는다.
  if exists (select 1 from score_events where match_id = old.id) then
    raise exception '점수 기록이 있는 경기는 지울 수 없습니다. 무효 처리를 해주세요'
      using errcode = '42501';
  end if;

  return old;
end;
$fn$;
