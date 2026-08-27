import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { TournamentOnly } from './TournamentOnly'
import type { TournamentKind } from '@/types/database'

/**
 * 모임에는 점수판이 없다.
 *
 * 링크를 지우는 것만으로는 부족하다 — 주소를 직접 치거나, 예전에 열어 둔
 * 탭을 새로고침하거나, 누가 링크를 카톡으로 보내면 그대로 열린다.
 * **들어가는 문을 다 막았다고 방이 없어지는 것은 아니다.**
 */

const T_ID = '11111111-1111-1111-1111-111111111111'

const state = { kind: 'tournament' as TournamentKind | undefined }

vi.mock('./queries', () => ({
  useTournament: () => ({ data: state.kind ? { id: T_ID, kind: state.kind } : undefined }),
}))

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={[`/t/${T_ID}/matches/m1`]}>
      <Routes>
        <Route
          path="/t/:id/matches/:matchId"
          element={
            <TournamentOnly>
              <p>점수판</p>
            </TournamentOnly>
          }
        />
        <Route path="/t/:id" element={<p>코트 화면</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  state.kind = 'tournament'
})

describe('점수판은 대회에만 있다', () => {
  test('대회면 그대로 연다', () => {
    renderGuard()
    expect(screen.getByText('점수판')).toBeInTheDocument()
  })

  test('모임이면 코트 화면으로 돌려보낸다 — 주소로 들어와도', () => {
    state.kind = 'session'
    renderGuard()

    expect(screen.queryByText('점수판')).toBeNull()
    expect(screen.getByText('코트 화면')).toBeInTheDocument()
  })

  test('아직 모르는 동안에는 아무것도 그리지 않는다', () => {
    /*
     * '대회다' 로 넘겨짚으면 잠깐 점수판이 그려졌다 사라지고,
     * '모임이다' 로 넘겨짚으면 회선이 느린 체육관에서 대회 심판이 자기
     * 화면에서 튕긴다. 올 때까지 기다린다.
     */
    state.kind = undefined
    renderGuard()

    expect(screen.queryByText('점수판')).toBeNull()
    expect(screen.queryByText('코트 화면')).toBeNull()
  })
})
