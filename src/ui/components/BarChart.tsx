export interface BarRow { label: string; won: number; lost: number; }

/** 得点（青）と失点（赤）の横棒。最大値で幅をそろえる */
export function BarChart({ rows }: { rows: BarRow[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.won, r.lost]));
  return (
    <div class="bars" role="img" aria-label="ローテ別の得点と失点">
      <div class="bars-legend"><span class="sw won" />得点 <span class="sw lost" />失点</div>
      {rows.map((r) => (
        <div class="bar-row" key={r.label}>
          <b class="bar-label">{r.label}</b>
          <div class="bar-pair">
            <div class="bar-line"><div class="bar won" style={{ width: `${(r.won / max) * 100}%` }} /><span>{r.won}</span></div>
            <div class="bar-line"><div class="bar lost" style={{ width: `${(r.lost / max) * 100}%` }} /><span>{r.lost}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}
