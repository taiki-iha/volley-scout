import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('BOM付き・CRLF・ヘッダー行・nullは空欄', () => {
    const s = toCsv([{ a: 1, b: null }, { a: 2, b: 'x' }]);
    expect(s.startsWith('﻿')).toBe(true);
    expect(s).toBe('﻿a,b\r\n1,\r\n2,x');
  });
  it('カンマ・改行・"はクォートする', () => {
    const s = toCsv([{ a: 'a,b', b: 'q"r\ns' }]);
    expect(s).toContain('"a,b"');
    expect(s).toContain('"q""r\ns"');
  });
  it('空配列は空文字', () => {
    expect(toCsv([])).toBe('');
  });
});
