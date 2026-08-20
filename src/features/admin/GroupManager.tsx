import { Badge } from '@/components/ui/Badge'
import { InlineEdit } from '@/components/ui/InlineEdit'
import { useRenameGroup } from '@/features/tournament/queries'
import { toUserMessage } from '@/lib/errors'
import type { GroupRow } from '@/types/database'

interface GroupManagerProps {
  tournamentId: string
  groups: GroupRow[]
}

/**
 * 조 관리 — 이름만 바꾼다.
 *
 * 조커 지정과 조 개수는 대회를 만들 때 굳는다. 이미 치른 경기의 목표 점수와
 * 승점이 `match_teams` 에 스냅샷으로 박혀 있어서, 나중에 조커를 바꾸면
 * 지난 결과와 순위가 소급해서 어긋난다.
 */
export function GroupManager({ tournamentId, groups }: GroupManagerProps) {
  const rename = useRenameGroup(tournamentId)

  return (
    <section>
      <h2 className="text-lg font-bold text-ink-1">조 {groups.length}개</h2>
      <p className="mt-1 text-sm text-ink-2">
        이름만 바꿉니다. 조커 지정과 개수는 대회를 만들 때 정해집니다 — 이미 치른 경기의 목표 점수가
        그 설정으로 굳어 있어서 나중에 바꾸면 어긋납니다.
      </p>

      {rename.error && (
        <p role="alert" className="mt-3 text-sm font-medium text-team-b-fg">
          {toUserMessage(rename.error, '조 이름을 바꾸지 못했습니다')}
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {groups.map((g) => (
          <li
            key={g.id}
            className="flex items-center gap-2 rounded-xl border border-border-subtle
                       bg-surface-1 py-2 pr-3 pl-3"
          >
            <span className="min-w-0 flex-1">
              <InlineEdit
                value={g.name}
                label={g.name}
                compact
                pending={rename.isPending}
                onSave={async (next) => {
                  await rename.mutateAsync({ groupId: g.id, name: next })
                }}
              />
            </span>
            {g.is_joker && <Badge tone="joker">🃏 조커</Badge>}
          </li>
        ))}
      </ul>
    </section>
  )
}
