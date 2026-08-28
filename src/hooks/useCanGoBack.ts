import { useLocation } from 'react-router-dom'

/**
 * 지금 뒤로가기가 **히스토리를 되짚는가**(아니면 못 박은 곳으로 보내는가).
 *
 * `location.key` 가 `'default'` 면 이 앱에서 연 첫 화면이다 — 카톡으로
 * 받은 주소를 눌러 바로 들어온 경우라 되짚을 것이 없다. 그때 `back` 하면
 * 앱 밖으로 나가버리므로 `BackLink` 는 대신 `to` 로 보낸다.
 *
 * 이걸 훅으로 떼어 낸 이유는 머리말도 같은 답이 필요해서다 — 뒤로가기가
 * 마침 메인으로 향하는 순간에는 그 옆에 홈을 또 세우면 같은 버튼이 둘이
 * 된다(`BackBar`). 두 곳이 각자 판단하면 언젠가 답이 갈린다.
 */
export function useCanGoBack(fixed = false): boolean {
  const location = useLocation()
  return !fixed && location.key !== 'default'
}
