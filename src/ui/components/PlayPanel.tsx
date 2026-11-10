import type { Lineup, PlayKind, Side } from '../../core/types';
import { PLAY_LABEL, SIDE_LABEL, availablePlays, blockerCandidates, isScoring, other, showBlockHint, type Step } from '../live.logic';

interface Props {
  step: Step;
  lineups: Record<Side, Lineup>;
  serving: Side;                          // サーブ権のある側（サーブ系のプレーはそのサーバーだけに出す）
  disabled: boolean;                      // セット終了後など
  onPlay: (p: PlayKind | 'attempt') => void;
  onLandUnknown: () => void;              // 落ちた場所の「場所不明」（場所はコートをタップ）
  onBlocker: (no: number | null) => void;
  onNoPlayer: (pointTo: Side) => void;
  onCancel: () => void;
}

export function PlayPanel({ step, lineups, serving, disabled, onPlay, onLandUnknown, onBlocker, onNoPlayer, onCancel }: Props) {
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
          {showBlockHint(step.sel, lineups) && (
            // 相手の「ブロック得点」から入れると自チームの打者が不明になり、効果率が正しく出ない
            <p class="pp-note">被ブロックは自チーム打者の「{PLAY_LABEL.spike_blocked}」で入力</p>
          )}
          <div class="pp-btns">
            {availablePlays(step.sel, serving, lineups).map((p) => (
              <button key={p} class={`pp-b ${p === 'attempt' ? 'neutral wide' : isScoring(p) ? 'good' : 'bad'}`} onClick={() => onPlay(p)}>
                {PLAY_LABEL[p]}
              </button>
            ))}
          </div>
        </>
      );
    } else if (step.k === 'land') {
      const def = other(step.sel.side);
      body = (
        <>
          <div class="pp-title"><b>{who}</b> {PLAY_LABEL[step.play]} → 落ちた場所は？</div>
          <p class="pp-land">
            {def === 'them' ? '◀ 左の相手コート' : '右の自チームコート ▶'}の<br />落ちた場所をタップ
          </p>
          <button class="pp-b neutral wide" onClick={onLandUnknown}>場所不明</button>
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
