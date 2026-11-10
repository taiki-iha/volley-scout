import { useState } from 'preact/hooks';
import { COURT_M, HIT_LABEL, HIT_POSITIONS, toSvg, zoneCenter } from '../../core/court';
import type { Side, Zone } from '../../core/types';
import { coursePlayers, type CourseMark } from '../../stats/course';
import { HIT_COLOR, courseShapes } from '../analysis.logic';

interface Props {
  title: string;
  side: Side;                         // 打った側（落下点は相手 = 守る側のコートに描く）
  marks: CourseMark[];
  labelOf: (no: number) => string;
}

const ZONES: Zone[] = [1, 2, 3, 4, 5, 6];
/** 矢印の先は落下点の丸の手前で止める（丸に隠れないように） */
function tip(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  const gap = 0.26;
  return d <= gap ? to : { x: to.x - (dx / d) * gap, y: to.y - (dy / d) * gap };
}
const markerId = (side: Side, color: string): string => `course-arrow-${side}-${color.replace('#', '')}`;
const SIDE_NAME: Record<Side, string> = { us: '自チームコート', them: '相手コート' };

/**
 * コース図。画面のコートと同じ向き（左 = 相手コート、右 = 自チームコート、ネットは中央）で、
 * スパイク決定は打った位置から落下点へ細い矢印、サービスエースは別の印（◆）で描く。選手で絞り込める。
 */
export function CourseChart({ title, side, marks, labelOf }: Props) {
  const [player, setPlayer] = useState<number | null>(null);
  const players = coursePlayers(marks);
  const eff = player !== null && players.includes(player) ? player : null;
  const shapes = courseShapes(marks, eff);
  const def: Side = side === 'us' ? 'them' : 'us';
  const defX = def === 'them' ? 0 : COURT_M;
  const kills = shapes.filter((s) => s.kind === 'kill').length;
  const aces = shapes.length - kills;

  return (
    <section class="card course">
      <h2>{title}</h2>
      <div class="row course-ctl">
        <label class="field">選手
          <select value={eff ?? ''} onChange={(e) => { const v = e.currentTarget.value; setPlayer(v === '' ? null : Number(v)); }}>
            <option value="">全員</option>
            {players.map((no) => <option key={no} value={no}>{labelOf(no)}</option>)}
          </select>
        </label>
        <span class="muted">スパイク決定 {kills}本・サービスエース {aces}本</span>
      </div>
      {marks.length === 0 ? (
        <p class="muted">落ちた場所が記録されたスパイク決定・サービスエースがありません</p>
      ) : (
        <svg class="course-svg" viewBox="-2.5 -1.2 23 11.4" role="img" aria-label={`${title}（${SIDE_NAME[def]}に落下点）`}>
          <defs>
            {/* 矢印の先（色ごとに用意。context-stroke は古い Safari で効かないため） */}
            {Object.values(HIT_COLOR).map((c) => (
              <marker key={c} id={markerId(side, c)} viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="0.55" markerHeight="0.55" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill={c} />
              </marker>
            ))}
          </defs>
          {/* コート: 守る側を白く、打った側は薄く */}
          <rect x="0" y="0" width={COURT_M} height={COURT_M} class={def === 'them' ? 'cs-def' : 'cs-att'} />
          <rect x={COURT_M} y="0" width={COURT_M} height={COURT_M} class={def === 'us' ? 'cs-def' : 'cs-att'} />
          <line x1={COURT_M - 3} y1="0" x2={COURT_M - 3} y2={COURT_M} class="cs-attack" />
          <line x1={COURT_M + 3} y1="0" x2={COURT_M + 3} y2={COURT_M} class="cs-attack" />
          {/* 守る側のゾーンの区切りと番号 */}
          <line x1={defX} y1={COURT_M / 3} x2={defX + COURT_M} y2={COURT_M / 3} class="cs-lane" />
          <line x1={defX} y1={(COURT_M * 2) / 3} x2={defX + COURT_M} y2={(COURT_M * 2) / 3} class="cs-lane" />
          {ZONES.map((z) => {
            const c = toSvg(def, zoneCenter(z));
            return <text key={z} x={c.x} y={c.y} class="cs-zone">{z}</text>;
          })}
          <line x1={COURT_M} y1="-0.6" x2={COURT_M} y2={COURT_M + 0.6} class="cs-net" />
          <text x={COURT_M / 2} y="-0.4" class="cs-label">相手コート</text>
          <text x={COURT_M * 1.5} y="-0.4" class="cs-label">自チームコート</text>
          {shapes.map((s, i) => (
            <g key={i}>
              {s.from && (
                <line x1={s.from.x} y1={s.from.y} x2={tip(s.from, s.to).x} y2={tip(s.from, s.to).y} stroke={s.color} class="cs-arrow"
                  marker-end={`url(#${markerId(side, s.color)})`} />
              )}
              {s.kind === 'kill'
                ? <circle cx={s.to.x} cy={s.to.y} r="0.22" fill={s.color} class="cs-dot" />
                : <rect x={s.to.x - 0.24} y={s.to.y - 0.24} width="0.48" height="0.48" fill={s.color} class="cs-dot"
                    transform={`rotate(45 ${s.to.x} ${s.to.y})`} />}
            </g>
          ))}
        </svg>
      )}
      <div class="course-legend">
        {HIT_POSITIONS.map((h) => <span key={h}><i class="sw" style={{ background: HIT_COLOR[h] }} />{HIT_LABEL[h]}</span>)}
        <span><i class="sw" style={{ background: HIT_COLOR.unknown }} />位置不明</span>
        <span><i class="sw ace" />サービスエース</span>
        <span class="muted">● = スパイク決定の落下点（矢印は打った位置から）</span>
      </div>
    </section>
  );
}
