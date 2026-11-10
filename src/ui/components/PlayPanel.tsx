import type { Lineup, PlayKind, Side, Zone } from '../../core/types';
import { PLAY_LABEL, SIDE_LABEL, ZONE_GRID, availablePlays, blockerCandidates, isScoring, type Step } from '../live.logic';

interface Props {
  step: Step;
  lineups: Record<Side, Lineup>;
  serving: Side;                          // サーブ権のある側（サーブ系のプレーはそのサーバーだけに出す）
  disabled: boolean;                      // セット終了後など
  onPlay: (p: PlayKind | 'attempt') => void;
  onZone: (z: Zone | null) => void;
  onBlocker: (no: number | null) => void;
  onNoPlayer: (pointTo: Side) => void;
  onCancel: () => void;
}

export function PlayPanel({ step, lineups, serving, disabled, onPlay, onZone, onBlocker, onNoPlayer, onCancel }: Props) {
  let body;
  if (disabled) {
    body = <p class="muted">セットが終わっています</p>;
  } else if (step.k === 'idle') {
    body = <p class="pp-hint">コートの選手をタップ</p>;
  } else {
    const who = `${SIDE_LABEL[step.sel.side]} #${step.sel.player}`;
    if (step.k === 'play') {
      body = (
        <>
          <div class="pp-title"><b>{who}</b> → 何をした？</div>
          <div class="pp-btns">
            {availablePlays(step.sel, serving, lineups).map((p) => (
              <button key={p} class={`pp-b ${p === 'attempt' ? 'neutral wide' : isScoring(p) ? 'good' : 'bad'}`} onClick={() => onPlay(p)}>
                {PLAY_LABEL[p]}
              </button>
            ))}
          </div>
        </>
      );
    } else if (step.k === 'zone') {
      body = (
        <>
          <div class="pp-title"><b>{who}</b> {PLAY_LABEL[step.play]} → どこから？</div>
          <div class="pp-zones">
            {ZONE_GRID.map((z) => <button key={z} class="zone" onClick={() => onZone(z)}>{z}</button>)}
          </div>
          <button class="pp-b neutral wide" onClick={() => onZone(null)}>ゾーン不明</button>
        </>
      );
    } else {
      body = (
        <>
          <div class="pp-title"><b>{who}</b> 被ブロック → ブロックした相手（任意）</div>
          <div class="pp-zones">
            {blockerCandidates(lineups, step.sel.side).map((no) => <button key={no} class="zone" onClick={() => onBlocker(no)}>#{no}</button>)}
          </div>
          <button class="pp-b neutral wide" onClick={() => onBlocker(null)}>スキップ</button>
        </>
      );
    }
  }
  return (
    <div class="panel-box play-panel">
      {body}
      {!disabled && step.k !== 'idle' && <button class="pp-cancel" onClick={onCancel}>選択をやめる</button>}
      {!disabled && (
        <div class="pp-noplayer">
          <button class="pp-b good" onClick={() => onNoPlayer('us')}>相手のミスで得点</button>
          <button class="pp-b bad" onClick={() => onNoPlayer('them')}>自チームのミスで失点</button>
        </div>
      )}
    </div>
  );
}
