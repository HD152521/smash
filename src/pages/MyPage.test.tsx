import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MyPage } from './MyPage'
import type { MyProfile } from '@/features/profile/api'

/**
 * 마이페이지가 지키는 것.
 *
 * 이 화면이 생긴 이유가 하나다 — **가입 때 받은 값을 고칠 데가 없었다.**
 * 그래서 여기서 시험하는 것도 "고칠 수 있는가" 에 집중한다:
 *
 *  · 지금 값이 폼에 그려진다 (효과로 베끼지 않고 서버 값을 직접 그린다)
 *  · 바꾸기 전에는 저장이 안 눌린다 — 누를 수 있으면 안 바뀐 값을 다시 쓴다
 *  · '모름' 으로 **비울 수 있다** — 잘못 고른 것을 되돌리는 유일한 경로다
 *  · 스냅샷 규율("이미 들어간 명단은 안 바뀐다")을 화면이 먼저 말한다
 *  · 알림과 로그아웃이 여기 있다 (메인에서 옮겨 왔다)
 */

const state = {
  profile: null as MyProfile | null,
  pending: false,
  error: null as unknown,
  savePending: false,
  saveError: null as unknown,
  saveSuccess: false,
}

const mutateAsync = vi.fn(async () => state.profile)
const reset = vi.fn()
const signOut = vi.fn()

vi.mock('@/features/auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@example.com' }, signOut }),
}))

vi.mock('@/features/profile/queries', () => ({
  useMyProfile: () => ({
    data: state.profile,
    isPending: state.pending,
    error: state.error,
  }),
  useUpdateMyProfile: () => ({
    mutateAsync,
    reset,
    isPending: state.savePending,
    isError: Boolean(state.saveError),
    isSuccess: state.saveSuccess,
    error: state.saveError,
  }),
}))

function renderMe() {
  return render(
    <MemoryRouter initialEntries={['/me']}>
      <MyPage />
    </MemoryRouter>,
  )
}

/** 급수·성별 두 그룹에 똑같이 '모름' 칸이 있다 — 그룹 이름으로 먼저 좁힌다 */
function pick(groupName: '급수' | '성별', optionName: string) {
  const group = screen.getByRole('group', { name: groupName })
  fireEvent.click(within(group).getByRole('radio', { name: optionName }))
}

function saveButton() {
  return screen.getByRole('button', { name: '저장' })
}

beforeEach(() => {
  vi.clearAllMocks()
  state.profile = { id: 'u1', name: '홍길동', grade: 'B', gender: 'male' }
  state.pending = false
  state.error = null
  state.savePending = false
  state.saveError = null
  state.saveSuccess = false
})

describe('지금 값을 그대로 보여준다', () => {
  test('이름·급수·성별이 서버 값으로 그려진다', () => {
    renderMe()
    expect(screen.getByDisplayValue('홍길동')).toBeInTheDocument()
    const grade = screen.getByRole('group', { name: '급수' })
    expect(within(grade).getByRole('radio', { name: 'B' })).toBeChecked()
    const gender = screen.getByRole('group', { name: '성별' })
    expect(within(gender).getByRole('radio', { name: '남' })).toBeChecked()
  })

  test('아직 안 고른 값은 모름에 있다 — 빈 칸이 아니라 실제 선택지다', () => {
    state.profile = { id: 'u1', name: '홍길동', grade: null, gender: null }
    renderMe()
    const gender = screen.getByRole('group', { name: '성별' })
    expect(within(gender).getByRole('radio', { name: '모름' })).toBeChecked()
  })
})

describe('저장', () => {
  test('바꾼 것이 없으면 저장이 안 눌린다', () => {
    renderMe()
    expect(saveButton()).toBeDisabled()
  })

  test('성별을 바꾸면 이름·급수와 함께 한 번에 보낸다', () => {
    renderMe()
    pick('성별', '여')
    fireEvent.click(saveButton())

    expect(mutateAsync).toHaveBeenCalledWith({ name: '홍길동', grade: 'B', gender: 'female' })
  })

  /*
   * 되돌릴 방법이 없으면 잘못 고른 사람은 영영 그 값으로 남는다.
   * '모름' 이 실제 선택지로 그려져 있는 것이 그 방법이고, 서버도 null 을
   * "안 바꾼다" 가 아니라 "모른다로 만들어라" 로 읽는다(set_member_gender
   * 주석과 같은 규율).
   */
  test("'모름' 을 눌러 비울 수 있다 — null 이 그대로 실려 간다", () => {
    renderMe()
    pick('급수', '모름')
    fireEvent.click(saveButton())

    expect(mutateAsync).toHaveBeenCalledWith({ name: '홍길동', grade: null, gender: 'male' })
  })

  test('이름 앞뒤 공백은 떼고 보낸다', () => {
    renderMe()
    fireEvent.change(screen.getByDisplayValue('홍길동'), { target: { value: '  김철수  ' } })
    fireEvent.click(saveButton())

    expect(mutateAsync).toHaveBeenCalledWith({ name: '김철수', grade: 'B', gender: 'male' })
  })

  test('이름을 다 지우면 저장이 막히고 이유를 말한다', () => {
    renderMe()
    fireEvent.change(screen.getByDisplayValue('홍길동'), { target: { value: '   ' } })

    expect(saveButton()).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('이름은 1~20자로 입력해 주세요')
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  test('저장에 실패하면 그 자리에서 말한다', () => {
    state.saveError = new Error('네트워크 연결을 확인해 주세요')
    renderMe()
    expect(screen.getByRole('alert')).toHaveTextContent('네트워크 연결을 확인해 주세요')
  })
})

/*
 * 명단의 급수·성별은 들어올 때 찍힌 스냅샷이라 여기를 고쳐도 안 바뀐다.
 * 그 사실을 화면이 **먼저** 말하지 않으면 사용자는 저장이 안 된 줄 안다 —
 * 이 문구가 이 화면에서 가장 중요한 한 줄이다.
 */
test('이미 들어간 명단은 안 바뀐다는 것을 먼저 말한다', () => {
  renderMe()
  expect(screen.getByText(/앞으로 들어가는 명단/)).toBeInTheDocument()
})

describe('나에 관한 나머지가 여기 모인다', () => {
  test('알림 설정으로 가는 줄이 있다', () => {
    renderMe()
    expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute('href', '/settings/alerts')
  })

  test('로그아웃이 여기 있다 — 메인 맨 아래가 아니라', () => {
    renderMe()
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }))
    expect(signOut).toHaveBeenCalled()
  })
})
