import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef } from 'preact/hooks';
import type { Side } from '../../core/types';
import type { FlowMarker, SetFlow } from '../scoreFlow.logic';

interface Props {
  flow: SetFlow; opponentName: string;
  /** 最新の得点まで横に自動スクロールする（入力・閲覧画面） */
  follow?: boolean;
  compact?: boolean;
}

const SIDE_SHORT: Record<Side, string> = { us: '自', them: '相' };
const KIND_LABEL: Record<FlowMarker['kind'], string> = { timeout: 'T', sub: '交' };
const KIND_TITLE: Record<FlowMarker['kind'], string> = { timeout: 'タイムアウト', sub: '選手交代' };

/** テレビ中継の「得点経過」。1列が1ラリーで、取った側の段にその時点の得点を出す */
export function ScoreFlow({ flow, opponentName, follow, compact }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const n = flow.columns.length + flow.markers.length;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (follow && el) el.scrollLeft = el.scrollWidth;
  }, [follow, n]);

  const items: ComponentChildren[] = [];
  let m = 0;
  const pushMarkers = (upTo: number) => {
    while (m < flow.markers.length && flow.markers[m].afterColumn <= upTo) {
      const mk = flow.markers[m++];
      const who = mk.side === 'us' ? '自チーム' : opponentName;
      items.push(
        <div key={`m${m}`} class={`sf-mk ${mk.side}`} title={`${KIND_TITLE[mk.kind]}（${who}）`} aria-label={`${KIND_TITLE[mk.kind]}（${who}）`}>
          <b>{KIND_LABEL[mk.kind]}</b><small>{SIDE_SHORT[mk.side]}</small>
        </div>,
      );
    }
  };
  pushMarkers(0);
  flow.columns.forEach((c, i) => {
    items.push(
      <div key={c.eventId} class={`sf-col${c.runOf ? ` run-${c.runOf}` : ''}`}>
        <span class={`sf-cell us${c.us !== null ? ' on' : ''}`}>{c.us ?? ''}</span>
        <span class={`sf-cell them${c.them !== null ? ' on' : ''}`}>{c.them ?? ''}</span>
      </div>,
    );
    pushMarkers(i + 1);
  });

  const status = flow.over ? '終了' : '途中';
  return (
    <div class={`sf${compact ? ' compact' : ''}`}>
      <div class="sf-head">
        <b>第{flow.set}セット</b>
        <span class="sf-score">自チーム {flow.score.us} - {flow.score.them} {opponentName}</span>
        <small class="muted">（{status}）</small>
      </div>
      <div class="sf-body">
        <div class="sf-labels">
          <span class="sf-lab us">自チーム</span>
          <span class="sf-lab them">{opponentName}</span>
        </div>
        <div class="sf-scroll" ref={scroller}>
          {flow.columns.length === 0 && flow.markers.length === 0
            ? <span class="sf-empty muted">まだ得点がありません</span>
            : <div class="sf-track">{items}</div>}
        </div>
      </div>
    </div>
  );
}

/** 凡例（連続得点の色・印の意味） */
export function ScoreFlowLegend() {
  return (
    <div class="sf-legend muted">
      <span><i class="sw sf-sw-us" />自チームの連続得点</span>
      <span><i class="sw sf-sw-them" />相手の連続得点</span>
      <span>T = タイムアウト　交 = 選手交代（自 / 相 = どちらのチームか）</span>
    </div>
  );
}
