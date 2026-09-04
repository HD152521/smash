import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shiftMonth } from '@/lib/dues'
import {
  fetchDuesEntries,
  fetchDuesSummary,
  openDuesMonth,
  removeDuesEntry,
  restoreDuesEntry,
  setDuesAmount,
  setDuesNote,
  setDuesPaid,
} from './api'

const duesKeys = {
  entries: (clubId: string, month: string) => ['clubs', clubId, 'dues', month] as const,
  summary: (clubId: string, month: string) => ['clubs', clubId, 'dues', month, 'summary'] as const,
  /** 그 동아리의 회비 전부 — 달을 넘나드는 변경 뒤에 통째로 턴다 */
  all: (clubId: string) => ['clubs', clubId, 'dues'] as const,
}

/**
 * 장부 한 달치. **운영진만** 행을 받는다 — 회원이 부르면 빈 배열이 온다
 * (오류가 아니다. RLS 가 거른 0행이라 PostgREST 는 200 을 준다).
 *
 * 그래서 화면은 "비었다" 를 두 가지로 읽으면 안 된다. 운영진 화면에서만
 * 이 훅을 쓰고, 회원 화면은 `useDuesSummary` 만 쓴다.
 */
export function useDuesEntries(clubId: string | undefined, monthKey: string, enabled = true) {
  return useQuery({
    queryKey: duesKeys.entries(clubId ?? '', monthKey),
    queryFn: () => fetchDuesEntries(clubId!, monthKey),
    enabled: Boolean(clubId) && enabled,
  })
}

/** 합계 둘 + 본인 행. 회원도 운영진도 같은 숫자를 본다 */
export function useDuesSummary(clubId: string | undefined, monthKey: string) {
  return useQuery({
    queryKey: duesKeys.summary(clubId ?? '', monthKey),
    queryFn: () => fetchDuesSummary(clubId!, monthKey),
    enabled: Boolean(clubId),
  })
}

/**
 * 지난 달 장부 — 이번 달을 열 때 채워 넣을 기본 금액을 여기서 고른다.
 *
 * 없으면 빈 칸으로 시작한다. 앱이 금액을 만들어 내지 않는 것이 원칙이라
 * (마이그레이션 설계 판단 2), 이 값도 계산이 아니라 **입력칸 초기값**이다.
 */
export function usePreviousMonthDues(clubId: string | undefined, monthKey: string, enabled = true) {
  return useDuesEntries(clubId, shiftMonth(monthKey, -1), enabled)
}

/*
 * 아래 쓰기 훅들이 모두 `duesKeys.all` 을 터는 이유:
 * 한 행이 바뀌면 그 달의 목록과 합계가 **같이** 틀려진다. 둘을 따로 털면
 * 목록에는 납부로 뜨는데 위의 합계는 옛 숫자인 화면이 잠깐 생기고,
 * 총무는 그 순간 앱을 안 믿기 시작한다.
 */

export function useOpenDuesMonth(clubId: string, monthKey: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (amount: number) => openDuesMonth(clubId, monthKey, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: duesKeys.all(clubId) }),
  })
}

export function useSetDuesPaid(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ duesId, paid }: { duesId: string; paid: boolean }) =>
      setDuesPaid(duesId, paid),
    onSuccess: () => qc.invalidateQueries({ queryKey: duesKeys.all(clubId) }),
  })
}

export function useSetDuesAmount(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ duesId, amount }: { duesId: string; amount: number }) =>
      setDuesAmount(duesId, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: duesKeys.all(clubId) }),
  })
}

export function useSetDuesNote(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ duesId, note }: { duesId: string; note: string }) => setDuesNote(duesId, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: duesKeys.all(clubId) }),
  })
}

export function useRemoveDuesEntry(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (duesId: string) => removeDuesEntry(duesId),
    onSuccess: () => qc.invalidateQueries({ queryKey: duesKeys.all(clubId) }),
  })
}

/** 뺀 사람 되돌리기. 그 행을 살리는 것이라 금액·메모가 그대로 돌아온다 */
export function useRestoreDuesEntry(clubId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (duesId: string) => restoreDuesEntry(duesId),
    onSuccess: () => qc.invalidateQueries({ queryKey: duesKeys.all(clubId) }),
  })
}
