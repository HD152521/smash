import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { BackLink } from './BackLink'

/**
 * 뒤로가기는 '온 길' 을 되짚어야 한다.
 *
 * 예전에는 고정된 곳으로 보냈다. 대진표에서 경기로 들어가도 뒤로가 대회
 * 메인이라, 보던 목록으로 돌아가려면 한 번 더 눌러야 했다.
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

describe('BackLink', () => {
  test('직전에 보던 화면으로 돌아간다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await user.click(screen.getByText('대진표로'))
    await user.click(screen.getByText('경기로'))
    expect(screen.getByText('경기')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '뒤로' }))
    // 고정 목적지('/')가 아니라 온 길인 대진표로 가야 한다
    expect(screen.getByText('대진표')).toBeInTheDocument()
  })

  test('링크로 바로 들어왔으면 앱 밖으로 나가지 않고 to 로 간다', async () => {
    // 카톡으로 받은 주소를 눌러 들어온 경우. 되짚을 히스토리가 없다.
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/match']}>
        <App />
      </MemoryRouter>,
    )

    const back = screen.getByRole('button', { name: '메인으로' })
    await user.click(back)
    expect(screen.getByText('메인')).toBeInTheDocument()
  })

  /*
   * 표적 크기는 코드 리뷰로는 안 지켜진다 — 클래스 하나만 빠져도 20px 짜리
   * 글자 표적으로 되돌아간다. 최소치(44px)가 아니라 실제로 쓰는 48px 를
   * 못 박는다. 머리말이 고정되면서 이 버튼은 화면에 늘 떠 있게 됐다.
   */
  test('탭 영역이 48px 아래로 내려가지 않는다', () => {
    render(
      <MemoryRouter initialEntries={['/match']}>
        <App />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: '메인으로' }).className).toContain('min-h-12')
  })
})
