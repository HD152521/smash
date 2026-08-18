-- ════════════════════════════════════════════════════════════════════
-- 경기가 하나라도 있으면 대회를 삭제할 수 없던 문제
--
-- match_teams.group_id 가 on delete restrict 였다.
-- 대회를 지우면 groups 가 cascade 로 지워지려 하는데, 그 조를 참조하는
-- match_teams 가 남아 있어 외래키 위반으로 막힌다.
--
--   ERROR: update or delete on table "groups" violates foreign key
--          constraint "match_teams_group_id_fkey"
--
-- restrict 를 넣은 의도는 "조를 지워서 경기 기록을 깨뜨리지 말라" 였는데,
-- 조는 대회와 함께가 아니면 지워질 일이 없다. 대회를 지우는 순간
-- 경기도 함께 사라지는 게 맞으므로 cascade 가 옳다.
--
-- 조 자체를 개별 삭제하는 기능은 아직 없고, 생기더라도
-- "경기에 쓰인 조는 못 지운다" 는 애플리케이션 규칙으로 막는 편이
-- 오류 메시지가 사용자에게 읽힌다.
-- ════════════════════════════════════════════════════════════════════

alter table match_teams
  drop constraint match_teams_group_id_fkey,
  add constraint match_teams_group_id_fkey
    foreign key (group_id) references groups(id) on delete cascade;
