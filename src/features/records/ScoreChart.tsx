import { useId } from 'react'
import type { Progress, Side } from '@/lib/scoreProgress'

/**
 * 점수 진행 꺾은선.
 *
 * 차트 라이브러리를 안 쓴다. CSP 가 외부 스크립트를 막고 있고(script-src 'self'),
 * 선 두 개 그리자고 수십 KB 를 내려받게 하면 체육관 회선에서 손해다.
 * 축과 선만 있으면 되는 그림이라 SVG 로 직접 그린다.
 *
 * 읽는 법: 가로는 랠리 순서, 세로는 그 시점의 누적 점수.
 * 한쪽 선만 올라가는 구간이 연속 득점이고, 두 선이 붙는 곳이 동점이다.
 */
export function ScoreChart({
  progress,
  nameA,
  nameB,
  target,
}: {
  progress: Progress
  nameA: string
  nameB: string
  /** 목표 점수 (조커 11 / 일반 21). 가로 안내선으로 그린다. */
  target?: number
}) {
  const titleId = useId()
  const { rallies, finalA, finalB } = progress

  if (rallies.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border-subtle p-6 text-center text-sm text-ink-2">
        점수 기록이 없습니다. 앱으로 채점하지 않고 결과만 입력한 경기입니다.
      </p>
    )
  }

  // viewBox 로 그리고 CSS 로 늘린다 — 화면 크기를 JS 로 재지 않아도 된다
  const W = 320
  const H = 180
  const PAD = { top: 8, right: 8, bottom: 18, left: 22 }
  const maxScore = Math.max(finalA, finalB, target ?? 0, 1)
  const maxRally = rallies.length

  const x = (i: number) => PAD.left + ((W - PAD.left - PAD.right) * i) / maxRally
  const y = (v: number) => H - PAD.bottom - ((H - PAD.top - PAD.bottom) * v) / maxScore

  // 0:0 에서 시작해 랠리마다 점을 찍는다
  const line = (pick: (r: (typeof rallies)[number]) => number) =>
    [`${x(0)},${y(0)}`, ...rallies.map((r, i) => `${x(i + 1)},${y(pick(r))}`)].join(' ')

  // 눈금은 목표 점수와 그 절반 정도만. 촘촘하면 선이 안 보인다.
  const ticks = target ? [0, Math.round(target / 2), target] : [0, maxScore]

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-labelledby={titleId}
        preserveAspectRatio="none"
      >
        <title id={titleId}>
          {`점수 진행 그래프. ${nameA} ${finalA}점, ${nameB} ${finalB}점. 총 ${maxRally}랠리.`}
        </title>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border-subtle"
              strokeWidth={0.5}
              strokeDasharray={t === target ? '3 2' : undefined}
            />
            <text
              x={PAD.left - 4}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-ink-3"
              style={{ fontSize: 8 }}
            >
              {t}
            </text>
          </g>
        ))}

        <polyline
          points={line((r) => r.b)}
          fill="none"
          className="stroke-team-b"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={line((r) => r.a)}
          fill="none"
          className="stroke-team-a"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        <text x={PAD.left} y={H - 4} className="fill-ink-3" style={{ fontSize: 8 }}>
          1
        </text>
        <text
          x={W - PAD.right}
          y={H - 4}
          textAnchor="end"
          className="fill-ink-3"
          style={{ fontSize: 8 }}
        >
          {maxRally}랠리
        </text>
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Legend side="A" name={nameA} score={finalA} />
        <Legend side="B" name={nameB} score={finalB} />
      </figcaption>
    </figure>
  )
}

function Legend({ side, name, score }: { side: Side; name: string; score: number }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={`h-0.5 w-4 rounded-full ${side === 'A' ? 'bg-team-a' : 'bg-team-b'}`}
      />
      <span className="font-semibold text-ink-1">{name}</span>
      <span className="tabular font-black text-ink-1">{score}</span>
    </span>
  )
}
