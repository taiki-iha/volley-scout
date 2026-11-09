import type { SetState } from '../../core/replay';
import type { Side } from '../../core/types';
import { rotationLabel } from '../live.logic';

interface Props { cur: SetState; setsWon: Record<Side, number>; opponentName: string }

export function Scoreboard({ cur, setsWon, opponentName }: Props) {
  const serveMark = (s: Side) => (cur.serving === s ? <span class="serve-dot" title="サーブ権">●</span> : null);
  return (
    <div class="scoreboard">
      <div class="sb-team">
        {serveMark('them')}
        <span class="sb-name">{opponentName}</span>
        <span class="sb-rot">{rotationLabel(cur.lineups.them, cur.setters.them)}</span>
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
        <span class="sb-rot">{rotationLabel(cur.lineups.us, cur.setters.us)}</span>
        <span class="sb-name">自チーム</span>
        {serveMark('us')}
      </div>
      <div class="sb-sub">
        <span>交代 {cur.subsUsed.them}/6・TO {cur.timeouts.them}</span>
        <span>交代 {cur.subsUsed.us}/6・TO {cur.timeouts.us}</span>
      </div>
    </div>
  );
}
