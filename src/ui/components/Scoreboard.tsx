import type { ComponentChildren } from 'preact';
import type { SetState } from '../../core/replay';
import type { Side } from '../../core/types';
import { rotationLabel } from '../live.logic';

/** clock = 経過時間（下の段の中央に出す。毎秒更新するので別の部品にしてある） */
interface Props { cur: SetState; setsWon: Record<Side, number>; opponentName: string; clock?: ComponentChildren }

export function Scoreboard({ cur, setsWon, opponentName, clock }: Props) {
  const serveMark = (s: Side) => (cur.serving === s ? <span class="serve-dot" title="サーブ権">●</span> : null);
  return (
    <div class="scoreboard">
      <div class="sb-team">
        {serveMark('them')}
        <span class="sb-name">{opponentName}</span>
        <span class="sb-rot">{rotationLabel('them', cur.lineups.them, cur.setters.them, cur.rotations.them)}</span>
      </div>
      <div class="sb-center">
        <span class="sb-score">{cur.score.them}</span>
        <span class="sb-mid">
          <small>第{cur.set}セット</small>
          <small>セット {setsWon.them} - {setsWon.us}</small>
        </span>
        <span class="sb-score">{cur.score.us}</span>
      </div>
      <div class="sb-team sb-us">
        <span class="sb-rot">{rotationLabel('us', cur.lineups.us, cur.setters.us, cur.rotations.us)}</span>
        <span class="sb-name">自チーム</span>
        {serveMark('us')}
      </div>
      <div class="sb-sub">
        <span>交代 {cur.subsUsed.them}/6・TO {cur.timeouts.them}</span>
        {clock}
        <span>交代 {cur.subsUsed.us}/6・TO {cur.timeouts.us}</span>
      </div>
    </div>
  );
}
