import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import { TournamentNav, type TournamentTab } from './TournamentNav'

/**
 * 2026-08-27 개편 — 탭이 하단으로, 상단은 제목 한 줄로.
 *
 * docs/design.md '구조 — 하단탭으로 내린다' 를 지키는지 여기서 잡는다:
 *  · 상단에 홈·관리·설정 아이콘이 남아 있으면 안 된다 (더보기 시트로 옮겼다)
 *  · 하단탭은 코트·대진표·참가자·기록·더보기 다섯 개뿐이어야 한다
 *  · 탭에서 빠진 화면(심판·순위·관리·설정·홈)도 더보기로 도달 가능해야 한다
 *
 * 참가자는 2026-08-27 에 탭으로 되돌렸다 — 시트 안에 있으면 명단에 사람
 * 하나 넣는 데 탭이 하나 더 든다(docs/ui-redesign.md). 여기서 못을 박는다.
 */

const TOURNAMENT_ID = '11111111-1111-1111-1111-111111111111'

const navState = {
  name: '저녁 정기전',
  status: 'live' as const,
  isSession: false,
  isAdmin: false,
  isOwner: false,
  myName: '나',
  myGroupName: undefined as string | undefined,
  myGroupIsJoker: false,
  refereeCount: 0,
}

vi.mock('./useTournamentNav', () => ({
  useTournamentNav: () => navState,
}))

function renderNav(active: TournamentTab = 'court') {
  return render(
    <MemoryRouter initialEntries={[`/t/${TOURNAMENT_ID}`]}>
      <Routes>
        <Route path="/t/:id" element={<TournamentNav id={TOURNAMENT_ID} active={active} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('상단은 뒤로가기 · 제목 · 배지만 남는다', () => {
  test('홈·관리·설정 아이콘이 상단에 없다', () => {
    navState.isAdmin = true
    renderNav()
    expect(screen.queryByRole('link', { name: '홈으로' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '설정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^관리$/ })).not.toBeInTheDocument()
    navState.isAdmin = false
  })

  test('제목과 상태 배지는 그대로 보인다', () => {
    renderNav()
    expect(screen.getByRole('heading', { level: 1, name: '저녁 정기전' })).toBeInTheDocument()
    expect(screen.getByText('진행중')).toBeInTheDocument()
  })

  test('뒤로가기는 남는다', () => {
    renderNav()
    expect(screen.getByRole('button', { name: /내 대회/ })).toBeInTheDocument()
  })

  /*
   * BackBar 는 홈 버튼을 기본으로 켠다 — 하단탭이 없는 화면 스무 곳을 한
   * 번에 덮으려고 그렇게 뒀다. 여기만 예외다. 더보기 시트에 이미 홈이
   * 있어서 겹치고, 무엇보다 이 머리말은 자리가 없다 — 이름 + 상태 배지 +
   * 내 조 배지가 오른쪽을 다 쓴다. 홈이 끼면 긴 이름이 먼저 잘린다.
   */
  test('머리말에는 홈이 없다 — 더보기 시트에 이미 있다', () => {
    renderNav()
    expect(screen.queryByRole('button', { name: '홈으로 가기' })).not.toBeInTheDocument()
  })

  test('이름이 아무리 길어도 머리말이 이름을 잘라 낸다 (줄바꿈이 아니라)', () => {
    const short = navState.name
    navState.name = '수요일 저녁 정기 배드민턴 모임 겸 신입 환영 리그전 8월 마지막 주'
    navState.myGroupName = 'A조'
    renderNav()
    const title = screen.getByRole('heading', { level: 1 })
    expect(title.className).toContain('truncate')
    // truncate 가 실제로 먹으려면 부모가 min-w-0 로 줄어들 수 있어야 한다
    expect(title.parentElement?.className).toContain('min-w-0')
    navState.name = short
    navState.myGroupName = undefined
  })

  /*
   * 대회 화면은 전부 길다 — 대진표·기록·참가자는 스크롤이 기본이다.
   * 머리말이 흐름에 그냥 있으면 뒤로가기가 위로 사라져서, 나가려고 맨
   * 위까지 되감아야 했다. 여기서 고정을 못 박는다.
   */
  test('머리말이 스크롤을 내려도 남는다', () => {
    renderNav()
    const bar = screen.getByRole('button', { name: /내 대회/ }).closest('header')
    expect(bar?.className).toMatch(/(^|\s)sticky(\s|$)/)
    expect(bar?.className).toMatch(/(^|\s)top-0(\s|$)/)
  })

  test('머리말은 하단탭보다 아래 층이다', () => {
    renderNav()
    const bar = screen.getByRole('button', { name: /내 대회/ }).closest('header')
    const tabs = screen.getByRole('navigation', { name: '대회 메뉴' })
    const layer = (el: Element | null | undefined) =>
      Number(/(?:^|\s)z-(\d+)(?:\s|$)/.exec(el?.className ?? '')?.[1] ?? NaN)
    // 겹칠 자리는 아니지만, 겹치는 날이 오면 손이 자주 가는 쪽이 위여야 한다
    expect(layer(bar)).toBeLessThan(layer(tabs))
  })
})

describe('하단탭', () => {
  test('코트·대진표·참가자·기록 링크 넷 + 더보기 버튼 하나뿐이다', () => {
    renderNav()
    const nav = screen.getByRole('navigation', { name: '대회 메뉴' })
    expect(within(nav).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      `/t/${TOURNAMENT_ID}`,
      `/t/${TOURNAMENT_ID}/schedule`,
      `/t/${TOURNAMENT_ID}/members`,
      `/t/${TOURNAMENT_ID}/records`,
    ])
    expect(within(nav).getByRole('button', { name: /더보기/ })).toBeInTheDocument()
  })

  test('참가자는 시트가 아니라 탭에서 한 번에 간다 — 명단은 저녁 내내 바뀐다', () => {
    renderNav('members')
    const nav = screen.getByRole('navigation', { name: '대회 메뉴' })
    expect(within(nav).getByRole('link', { name: /참가자/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('button', { name: /더보기/ })).not.toHaveAttribute('aria-current')
  })

  test('44px 이상 터치 타깃 클래스를 쓴다', () => {
    renderNav()
    const nav = screen.getByRole('navigation', { name: '대회 메뉴' })
    for (const link of within(nav).getAllByRole('link')) {
      expect(link.className).toMatch(/min-h-16/)
    }
  })

  test('현재 탭에만 aria-current 가 붙는다', () => {
    renderNav('schedule')
    const nav = screen.getByRole('navigation', { name: '대회 메뉴' })
    expect(within(nav).getByRole('link', { name: /대진표/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: /^코트$/ })).not.toHaveAttribute('aria-current')
  })

  test('심판·순위로 가면 탭이 아니라 더보기가 대신 켜진다', () => {
    renderNav('standings')
    const nav = screen.getByRole('navigation', { name: '대회 메뉴' })
    expect(within(nav).getByRole('button', { name: /더보기/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('모임은 심판 배지가 안 뜬다', () => {
    navState.isSession = true
    navState.refereeCount = 2
    renderNav()
    const nav = screen.getByRole('navigation', { name: '모임 메뉴' })
    expect(nav).toBeInTheDocument()
    navState.isSession = false
    navState.refereeCount = 0
  })
})

describe('더보기 시트 — 탭에서 빠진 화면도 도달할 수 있다', () => {
  test('대회는 심판·순위·관리·설정·홈이 전부 있다', async () => {
    navState.isAdmin = true
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: /더보기/ }))

    expect(screen.getByRole('link', { name: /^심판/ })).toHaveAttribute(
      'href',
      `/t/${TOURNAMENT_ID}/referee`,
    )
    expect(screen.getByRole('link', { name: /순위/ })).toHaveAttribute(
      'href',
      `/t/${TOURNAMENT_ID}/standings`,
    )
    expect(screen.getByRole('link', { name: /^관리$/ })).toHaveAttribute(
      'href',
      `/t/${TOURNAMENT_ID}/admin`,
    )
    expect(screen.getByRole('link', { name: /^설정$/ })).toHaveAttribute(
      'href',
      `/t/${TOURNAMENT_ID}/settings`,
    )
    expect(screen.getByRole('link', { name: /^홈$/ })).toHaveAttribute('href', '/')

    navState.isAdmin = false
  })

  test('관리자가 아니면 관리 링크가 없다', async () => {
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: /더보기/ }))
    expect(screen.queryByRole('link', { name: /^관리$/ })).not.toBeInTheDocument()
  })

  test('모임에는 심판·순위가 없고 설정·홈만 남는다', async () => {
    navState.isSession = true
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: /더보기/ }))
    expect(screen.queryByRole('link', { name: /^심판/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /순위/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^설정$/ })).toBeInTheDocument()
    navState.isSession = false
  })

  test('심판 배지 숫자가 더보기 안 심판 링크에 붙는다', async () => {
    navState.refereeCount = 3
    renderNav()
    await userEvent.click(screen.getByRole('button', { name: /더보기/ }))
    expect(screen.getByRole('link', { name: /심판.*3/ })).toBeInTheDocument()
    navState.refereeCount = 0
  })
})
