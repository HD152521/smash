import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { BackLink } from './BackLink'

/**
 * **계약이 바뀌었다.** 2026-09-01 이전에는 이 링크가 히스토리를 되짚었고
 * (`navigate(-1)`), 그때 글자는 '뒤로' 로 고정됐다 — 되짚는 동안에는 어디로
 * 가는지 알 수 없기 때문이다.
 *
 * 지금은 하단탭이 대부분의 화면을 덮는다. 출구가 둘인데 하나가 어디로
 * 가는지 말하지 않으면 둘 다 덜 믿게 된다. 그래서 되짚기를 버리고 **못 박은
 * 목적지 하나**만 남겼다(`BackLink` 주석).
 *
 * 아래 묶음이 지키는 것은 하나다 — **글자와 실제로 가는 곳이 같다.**
 */
function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <div>
            <p>메인</p>
            <Link to="/schedule">대진표로</Link>
          </div>
        }
      />
      <Route
        path="/schedule"
        element={
          <div>
            <p>대진표</p>
            <Link to="/match">경기로</Link>
          </div>
        }
      />
      <Route
        path="/match"
        element={
          <div>
            <p>경기</p>
            <BackLink to="/">메인으로</BackLink>
          </div>
        }
      />
    </Routes>
  )
}

describe('BackLink — 정해진 곳으로만 간다', () => {
  test('세 화면을 지나 들어와도 히스토리를 되짚지 않고 to 로 간다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByText('대진표로'))
    await user.click(screen.getByText('경기로'))
    expect(screen.getByText('경기')).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: '메인으로' }))
    // 예전 계약이면 여기서 '대진표'(온 길)가 나왔다. 지금은 적힌 대로 메인이다.
    expect(screen.getByText('메인')).toBeInTheDocument()
  })

  test('링크로 바로 들어와도 같은 곳으로 간다 — 앱 밖으로 나가지 않는다', async () => {
    // 카톡으로 받은 주소를 눌러 들어온 경우. 되짚을 히스토리가 없다.
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/match']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('link', { name: '메인으로' }))
    expect(screen.getByText('메인')).toBeInTheDocument()
  })

  /*
   * 목적지가 못 박혀 있으므로 진짜 `<a href>` 여야 한다. 예전 `<button>` 은
   * 어디로 가는지 눌러 봐야만 알 수 있었다 — 화면 낭독기에게도, 링크를
   * 길게 눌러 새 탭으로 열려는 사람에게도.
   */
  test('주소가 마크업에 적힌다 (button 이 아니라 a)', () => {
    render(
      <MemoryRouter initialEntries={['/match']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '메인으로' })).toHaveAttribute('href', '/')
  })

  test("글자가 목적지를 말한다 — '뒤로' 가 남아 있지 않다", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    await user.click(screen.getByText('대진표로'))
    await user.click(screen.getByText('경기로'))

    // 되짚을 히스토리가 있든 없든 글자는 그대로다
    expect(screen.getByRole('link', { name: '메인으로' })).toBeInTheDocument()
    expect(screen.queryByText('뒤로')).not.toBeInTheDocument()
  })

  /*
   * 표적 크기는 코드 리뷰로는 안 지켜진다 — 클래스 하나만 빠져도 20px 짜리
   * 글자 표적으로 되돌아간다. 최소치(44px)가 아니라 실제로 쓰는 48px 를
   * 못 박는다. 머리말이 고정되면서 이 링크는 화면에 늘 떠 있게 됐다.
   */
  test('탭 영역이 48px 아래로 내려가지 않는다', () => {
    render(
      <MemoryRouter initialEntries={['/match']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '메인으로' }).className).toContain('min-h-12')
  })

  /*
   * 좁은 폰(320px)의 관전판에서 '나가기' 가 글자마다 줄바꿈돼 세 줄로
   * 접힌 적이 있다 — 찍어 봐야 보이는 종류의 파손이다. 출구가 접히면
   * 표적이 어디인지도 알 수 없다.
   */
  test('폭이 모자라도 접히지 않는다 — 밀리는 쪽은 제목이지 출구가 아니다', () => {
    render(
      <MemoryRouter initialEntries={['/match']}>
        <App />
      </MemoryRouter>,
    )
    const exit = screen.getByRole('link', { name: '메인으로' })
    expect(exit.className).toContain('whitespace-nowrap')
    expect(exit.className).toContain('shrink-0')
  })
})
