import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAddRosterMember } from './queries'
import { toUserMessage } from '@/lib/errors'

/**
 * 이름만으로 명단에 사람 넣기.
 *
 * 대회 날 아침에 20명이 각자 초대 코드를 치길 기다릴 수 없다. 계정이
 * 없어도 명단에는 올라가야 경기에 넣을 수 있다(`add_roster_member`).
 *
 * 관리(AdminMembersPage)와 참가자 화면이 같이 쓴다. **보는 화면에서 바로
 * 고칠 수 있어야 한다** — 늦게 온 사람 하나 넣으려고 더보기 → 관리 →
 * 참가자로 들어가는 건 명단이 자주 바뀌는 저녁에 감당이 안 된다.
 *
 * 넣고 나서 입력칸을 비우고 포커스를 남긴다. 문 앞에서 연달아 받아
 * 적는 상황이 기본이라 매번 칸을 다시 눌러야 하면 그게 제일 큰 마찰이다.
 */
export function AddMemberForm({ tournamentId }: { tournamentId: string }) {
  const addMember = useAddRosterMember(tournamentId)
  const [name, setName] = useState('')

  async function add() {
    const next = name.trim()
    if (!next) return
    try {
      await addMember.mutateAsync(next)
      setName('')
    } catch {
      // 오류는 아래에 뜬다 (중복 이름 등). 적어 둔 이름은 지우지 않는다.
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={name}
          maxLength={20}
          placeholder="이름으로 참가자 추가"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          aria-label="추가할 참가자 이름"
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-border-subtle bg-surface-1 px-3
                     text-base text-ink-1
                     focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600"
        />
        <Button
          onClick={() => void add()}
          loading={addMember.isPending}
          disabled={name.trim().length === 0}
          className="shrink-0"
        >
          <Plus className="size-4" aria-hidden />
          추가
        </Button>
      </div>

      {addMember.error && (
        <p role="alert" className="mt-2 text-sm font-medium text-team-b-fg">
          {toUserMessage(addMember.error, '참가자를 추가하지 못했습니다')}
        </p>
      )}
    </div>
  )
}
