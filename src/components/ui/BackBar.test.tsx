import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { BackBar } from './BackBar'

/**
 * 뒤로가기가 항상 손 닿는 곳에 있어야 한다.
 *
 * 예전엔 머리말이 문서 흐름에 그냥 있어서, 참가자 명단처럼 긴 화면에서는
 * 조금만 내려도 뒤로가기가 위로 사라졌다. 나가려면 맨 위까지 되감아야 했다.
 * 아이폰 홈 화면 추가(PWA)로 쓰는 사람에게는 브라우저 뒤로가기도 가장자리
 * 스와이프도 없어서, 이 버튼이 유일한 출구다.
 *
 * jsdom 은 스크롤도 레이아웃도 재지 못한다. 그래서 '고정이 유지되는가' 를
 * 눈으로 볼 수는 없고, **고정을 만드는 조건들**을 대신 못 박는다. 하나만
 * 빠져도 예전 상태로 조용히 되돌아가는 것들이다.
 */
function renderBar(extra?: Parameters<typeof BackBar>[0]) {
  render(
    <MemoryRouter initialEntries={['/t/1/members']}>
      {/* 실제 껍데기와 같은 여백 */}
      <main className="mx-auto w-full max-w-2xl px-5 pt-6 pb-16">
        <BackBar to="/my" label="내 대회" {...extra} />
        <p>참가자 명단</p>
      </main>
    </MemoryRouter>,
  )
  const button = screen.getByRole('button', { name: /내 대회|뒤로/ })
  const bar = button.closest('header')
  expect(bar).not.toBeNull()
  return { bar: bar!, button }
}

describe('BackBar — 하단탭이 없는 화면', () => {
  test('뒤로가기를 그린다', () => {
    const { button } = renderBar()
    expect(button).toBeInTheDocument()
  })

  test('스크롤을 내려도 화면 위에 남는다', () => {
    const { bar } = renderBar()
    expect(bar.className).toMatch(/(^|\s)sticky(\s|$)/)
    expect(bar.className).toMatch(/(^|\s)top-0(\s|$)/)
  })

  test('fixed 가 아니라 sticky 다 — 아래 내용이 머리말 뒤에 깔리면 안 된다', () => {
    // fixed 로 바꾸면 흐름에서 자리가 사라져 화면마다 상단 여백을 따로 맞춰야 한다.
    const { bar } = renderBar()
    expect(bar.className).not.toMatch(/(^|\s)fixed(\s|$)/)
  })

  test('껍데기 여백만큼 물러나 본문이 지나갈 틈을 없앤다', () => {
    // px-5 pt-6 안쪽에 그대로 두면 좌우 20px · 위 24px 띠로 글자가 흘러 지나간다.
    const { bar } = renderBar()
    expect(bar.className).toContain('-mx-5')
    expect(bar.className).toContain('-mt-6')
  })

  test('아이폰 노치만큼 배경을 더 깐다', () => {
    const { bar } = renderBar()
    expect(bar.getAttribute('style')).toContain('safe-area-inset-top')
  })

  test('배경이 반투명이 아니다 — 밑을 지나는 글자가 비치면 안 된다', () => {
    const { bar } = renderBar()
    expect(bar.className).toContain('bg-surface-0')
    expect(bar.className).not.toMatch(/bg-surface-\d\/\d+/)
  })

  test('오른쪽에 세운 것(제목·배지)도 같이 남는다', () => {
    renderBar({ to: '/my', label: '내 대회', children: <span>저녁 정기전</span> })
    expect(screen.getByText('저녁 정기전')).toBeInTheDocument()
  })

  test('껍데기 여백이 다른 화면은 맞춰 줄 수 있다 (관전판은 p-4)', () => {
    const { bar } = renderBar({
      to: '/my',
      label: '내 대회',
      className: '-mx-4 -mt-4 px-4',
      topPad: '1rem',
    })
    expect(bar.className).toContain('-mx-4')
    expect(bar.className).not.toContain('-mx-5')
    expect(bar.getAttribute('style')).toContain('1rem')
  })
})
