-- ════════════════════════════════════════════════════════════════════
-- 순위 기준: 승점 → 조커 → 득실차 → 총득점 → 조 번호
--
-- 조커조는 이겨도 승점이 0.5 다. 같은 승점을 쌓으려면 두 배를 이겨야 한다.
-- 그렇게 따라붙은 조를 득실 몇 점 차이로 아래에 두면 조커 규칙이
-- 이득이 아니라 벌칙이 된다. 그래서 조커를 득실보다 앞에 둔다.
--
-- 승자승은 뺐다. 조커 규칙과 겹칠 때 어느 쪽이 먼저인지 설명하기 어렵고,
-- 같은 조합을 여러 번 붙는 대회에서는 기준 자체가 흔들린다.
-- (승자승은 원래 화면 쪽에서만 계산했다 — 거기서도 함께 걷어냈다)
-- ════════════════════════════════════════════════════════════════════

create or replace function get_standings(p_tournament_id uuid)
returns table (
  group_id   uuid,
  group_name text,
  is_joker   boolean,
  sort_order int,
  played     bigint,
  wins       bigint,
  losses     bigint,
  points     numeric,
  scored     bigint,
  conceded   bigint,
  diff       bigint
)
language sql stable security definer set search_path = public, pg_temp as $fn$
  with team_rows as (
    select
      mt.group_id,
      mt.win_points,
      m.winner_side = mt.side as won,
      case when mt.side = 'A' then m.score_a else m.score_b end as scored,
      case when mt.side = 'A' then m.score_b else m.score_a end as conceded
    from match_teams mt
    join matches m on m.id = mt.match_id
    where m.tournament_id = p_tournament_id
      and m.status = 'finished'
  )
  select
    g.id,
    g.name,
    g.is_joker,
    g.sort_order,
    -- count(tr.*) 는 LEFT JOIN 의 NULL 확장 행까지 세는 함정이 있다.
    -- 실제 컬럼을 세야 경기를 한 번도 안 치른 조가 0 으로 나온다.
    count(tr.group_id)                                                 as played,
    count(*) filter (where tr.won)                                     as wins,
    count(*) filter (where tr.won is false)                            as losses,
    coalesce(sum(tr.win_points) filter (where tr.won), 0)::numeric     as points,
    coalesce(sum(tr.scored), 0)::bigint                                as scored,
    coalesce(sum(tr.conceded), 0)::bigint                              as conceded,
    coalesce(sum(tr.scored) - sum(tr.conceded), 0)::bigint             as diff
  from groups g
  left join team_rows tr on tr.group_id = g.id
  where g.tournament_id = p_tournament_id
  group by g.id, g.name, g.is_joker, g.sort_order
  order by points desc, g.is_joker desc, diff desc, scored desc, g.sort_order;
$fn$;

revoke all on function get_standings(uuid) from public, anon;
grant execute on function get_standings(uuid) to authenticated;
