const cell = (v: string | number | null): string => {
  if (v === null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// BOM 付き UTF-8（Excel の文字化け対策）、CRLF。列順は先頭行のキー順。
export function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const lines = [keys.map(cell).join(',')];
  for (const r of rows) lines.push(keys.map((k) => cell(r[k] ?? null)).join(','));
  return '﻿' + lines.join('\r\n');
}
