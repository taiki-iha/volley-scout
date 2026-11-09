import type { ConditionRow } from '../live.logic';

interface Props { rows: ConditionRow[]; nameOf: (no: number) => string; large?: boolean }

export function ConditionList({ rows, nameOf, large }: Props) {
  return (
    <div class={`panel-box cond${large ? ' large' : ''}`}>
      <div class="cond-title">今日の調子（スパイク 決定/打数・このセットのサーブミス）</div>
      {rows.length === 0 ? <p class="muted">まだ記録がありません</p> : (
        <table>
          <tbody>
            {rows.map((r) => (
              <tr key={r.no} class={`${r.bad ? 'bad' : ''}${r.onCourt ? '' : ' off'}`}>
                <td class="c-no">#{r.no}</td>
                <td class="c-name">{nameOf(r.no)}</td>
                <td>スパイク {r.kills}/{r.attempts}</td>
                <td>サーブミス {r.serveErrorsSet}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
