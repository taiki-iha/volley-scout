import { toCsv } from '../../stats/csv';
import type { CsvRow } from '../analysis.logic';

export function downloadCsv(rows: CsvRow[], fileName: string): void {
  const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** rows のキー順をそのまま列にする表。画面と CSV は同じ行を使う */
export function StatTable({ title, rows, fileName, empty }: { title: string; rows: CsvRow[]; fileName: string; empty?: string }) {
  return (
    <section class="card stat-card">
      <div class="row">
        <h2 class="grow">{title}</h2>
        <button disabled={rows.length === 0} onClick={() => downloadCsv(rows, fileName)}>CSV</button>
      </div>
      {rows.length === 0 ? <p class="muted">{empty ?? 'データがありません'}</p> : (
        <div class="stat-scroll">
          <table class="stat-table">
            <thead><tr>{Object.keys(rows[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{Object.keys(rows[0]).map((k) => <td key={k}>{r[k] ?? '-'}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
