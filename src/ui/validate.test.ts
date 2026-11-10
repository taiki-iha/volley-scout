import { describe, expect, it } from 'vitest';
import { fromPercent, parseThresholds, parseTimeoutSec, toPercent, validateOpponentPlayer, validatePlayer } from './validate';

const roster = [{ no: 7, name: 'A', position: 'S' as const }];

describe('validatePlayer', () => {
  it('正常', () => {
    expect(validatePlayer({ no: ' 10 ', name: ' B ', position: 'OH' }, roster, null)).toEqual({ ok: true, value: { no: 10, name: 'B', position: 'OH' } });
  });
  it('背番号の重複を拒否、編集中の自分は許可', () => {
    expect(validatePlayer({ no: '7', name: 'X', position: 'L' }, roster, null).ok).toBe(false);
    expect(validatePlayer({ no: '7', name: 'X', position: 'L' }, roster, 7).ok).toBe(true);
    expect(validatePlayer({ no: '7', name: 'X', position: 'L' }, roster, 3).ok).toBe(false);
  });
  it('不正な背番号・空の名前', () => {
    expect(validatePlayer({ no: 'a', name: 'X', position: 'S' }, [], null).ok).toBe(false);
    expect(validatePlayer({ no: '', name: 'X', position: 'S' }, [], null).ok).toBe(false);
    expect(validatePlayer({ no: '1', name: ' ', position: 'S' }, [], null).ok).toBe(false);
  });
});

describe('validateOpponentPlayer', () => {
  it('名前・ポジション任意', () => {
    expect(validateOpponentPlayer({ no: '5', name: '', position: '' }, [], null)).toEqual({ ok: true, value: { no: 5, name: '', position: null } });
  });
  it('背番号必須・重複不可', () => {
    expect(validateOpponentPlayer({ no: '', name: '', position: '' }, [], null).ok).toBe(false);
    expect(validateOpponentPlayer({ no: '5', name: '', position: 'MB' }, [{ no: 5, name: '', position: null }], null).ok).toBe(false);
  });
});

describe('thresholds', () => {
  it('%変換', () => {
    expect(toPercent(0.3)).toBe(30);
    expect(fromPercent(30)).toBe(0.3);
    expect(fromPercent(33.3)).toBe(0.333);
  });
  it('正常値', () => {
    expect(parseThresholds({ minSpikes: '5', maxKillRatePct: '30', maxServeErrorsPerSet: '2' })).toEqual({ ok: true, value: { minSpikes: 5, maxKillRate: 0.3, maxServeErrorsPerSet: 2 } });
  });
  it('範囲外', () => {
    expect(parseThresholds({ minSpikes: '0', maxKillRatePct: '30', maxServeErrorsPerSet: '2' }).ok).toBe(false);
    expect(parseThresholds({ minSpikes: '5', maxKillRatePct: '101', maxServeErrorsPerSet: '2' }).ok).toBe(false);
    expect(parseThresholds({ minSpikes: '5', maxKillRatePct: '-1', maxServeErrorsPerSet: '2' }).ok).toBe(false);
    expect(parseThresholds({ minSpikes: '5', maxKillRatePct: '30', maxServeErrorsPerSet: '1.5' }).ok).toBe(false);
  });
});

describe('parseTimeoutSec', () => {
  it('10〜120 の整数だけ通す', () => {
    expect(parseTimeoutSec('30')).toEqual({ ok: true, value: 30 });
    expect(parseTimeoutSec(' 10 ')).toEqual({ ok: true, value: 10 });
    expect(parseTimeoutSec('120')).toEqual({ ok: true, value: 120 });
    for (const bad of ['9', '121', '', '30.5', '-30', 'abc', '1e2']) expect(parseTimeoutSec(bad).ok).toBe(false);
  });
});
