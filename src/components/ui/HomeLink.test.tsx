import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { HomeLink } from './HomeLink'

/**
 * 홈은 **되짚지 않고 한 번에** 메인으로 보낸다. 그러면서 히스토리를 쌓지
 * 않는다 — 스택이 자라면 폰 뒤로가기가 방금 떠난 깊은 화면으로 사람을
 * 다시 빨아들인다.
 *
 * jsdom 에는 진짜 히스토리 스택이 없어서 '몇 칸 자랐나' 를 직접 셀 수는
 * 없다. 대신 **뒤로 한 번 눌렀을 때 어디로 가는가**로 잰다. `push` 면
 * 떠나온 화면으로 되돌아오고, `replace` 면 그 화면에 들어오기 전으로
 * 간다. 이 차이가 스택이 자랐는지 아닌지를 그대로 말해 준다.
 */
function App() {
  return (
    <Routes>
      <Route path="/" element={<Screen name="메인" next="/clubs" />} />
      <Route path="/clubs" element={<Screen name="내 동아리" next="/c/1/members" />} />
      <Route
        path="/c/1/members"
        element={
          <div>
            <p>동아리 명단</p>
            <HomeLink />
          </div>
        }
      />
    </Routes>
  )
}

function Screen({ name, next }: { name: string; next: string }) {
  const navigate = useNavigate()
  return (
    <div>
      <p>{name}</p>
      <Link to={next}>다음</Link>
      {/* 폰의 뒤로가기를 흉내 낸다 — 히스토리가 자랐는지는 이걸로만 잰다 */}
      <button type="button" onClick={() => navigate(-1)}>
        폰 뒤로
      </button>
    </div>
  )
}

async function goDeep() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>,
  )
  await user.click(screen.getByText('다음')) // → /clubs
  await user.click(screen.getByText('다음')) // → /c/1/members
  expect(screen.getByText('동아리 명단')).toBeInTheDocument()
  return user
}

describe('HomeLink', () => {
  test('한 번 눌러 메인으로 간다 — 되짚지 않는다', async () => {
    const user = await goDeep()
    await user.click(screen.getByRole('button', { name: /홈/ }))
    expect(screen.getByText('메인')).toBeInTheDocument()
  })

  test('히스토리를 쌓지 않는다 (replace) — 뒤로가 떠나온 화면으로 되돌아오지 않는다', async () => {
    const user = await goDeep()
    await user.click(screen.getByRole('button', { name: /홈/ }))
    expect(screen.getByText('메인')).toBeInTheDocument()

    // push 였다면 여기서 '동아리 명단' 으로 되돌아온다 = 스택이 한 칸 자랐다는 뜻
    await user.click(screen.getByRole('button', { name: '폰 뒤로' }))
    expect(screen.getByText('내 동아리')).toBeInTheDocument()
    expect(screen.queryByText('동아리 명단')).not.toBeInTheDocument()
  })

  test('화면 낭독기에 무엇을 하는 버튼인지 말한다', async () => {
    await goDeep()
    const home = screen.getByRole('button', { name: '홈으로 가기' })
    // 보이는 글자('홈')를 품는 이름이라야 음성으로 "홈" 이라 말해도 이 버튼이 잡힌다
    expect(home).toHaveAccessibleName(/홈/)
    expect(home.textContent).toContain('홈')
  })

  test('탭 영역이 48px 아래로 내려가지 않는다', async () => {
    await goDeep()
    expect(screen.getByRole('button', { name: /홈/ }).className).toContain('min-h-12')
  })

  test('제목이 길어도 찌그러지지 않는다', async () => {
    // shrink-0 이 빠지면 긴 대회 이름 옆에서 이 버튼이 먼저 눌려 납작해진다
    await goDeep()
    expect(screen.getByRole('button', { name: /홈/ }).className).toContain('shrink-0')
  })
})
