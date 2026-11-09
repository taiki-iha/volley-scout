import type { Lineup, Side } from '../../core/types';
import { SIDE_LABEL, type Sel } from '../live.logic';

interface Props {
  side: Side;
  lineup: Lineup;
  serving: boolean;           // このチームがサーブ権を持つ
  setter: number | null;
  liberos: number[];
  roleOf: (no: number) => string;
  bad: Set<number>;           // 調子の悪い選手（自チームのみ）
  selected: Sel | null;
  onTap?: (no: number) => void;  // 閲覧モードでは無し
}

// ネットが中央。左=相手（ネットは右側）、右=自チーム（ネットは左側）。
// 自チーム: 前衛列（ネット側）上から 2,3,4 / 後衛列 上から 1,6,5（ネットに向かって左手が下）
// 相手:     前衛列（ネット側）上から 4,3,2 / 後衛列 上から 5,6,1
const LAYOUT: Record<Side, number[]> = {
  // grid の並び（行ごとに 左列, 右列）。値はポジション番号
  them: [5, 4, 6, 3, 1, 2],
  us: [2, 1, 3, 6, 4, 5],
};

export function Court({ side, lineup, serving, setter, liberos, roleOf, bad, selected, onTap }: Props) {
  return (
    <div class={`court court-${side}`}>
      <div class="court-label">{SIDE_LABEL[side]}</div>
      <div class="court-grid">
        {LAYOUT[side].map((pos) => {
          const no = lineup[pos - 1];
          const isServer = serving && pos === 1;
          const cls = [
            'pl',
            liberos.includes(no) ? 'libero' : '',
            bad.has(no) ? 'bad' : '',
            selected && selected.side === side && selected.player === no ? 'sel' : '',
            pos >= 2 && pos <= 4 ? 'front' : 'back',
          ].filter(Boolean).join(' ');
          const role = no === setter ? 'S' : roleOf(no);
          return (
            <button key={pos} class={cls} disabled={!onTap} onClick={() => onTap?.(no)} aria-label={`${SIDE_LABEL[side]} ポジション${pos} 背番号${no}`}>
              <b>{no}</b>
              {role && <small>{role}</small>}
              {isServer && <span class="srv">サーブ</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
