import { describe, it, expect } from 'vitest';
import { lineupStatus, publicPlayerName, snapshotLineup, validateLineupForSubmit, isLineupPosition } from './lineup';

const row = (id: string, battingOrder: number | null, position: string | null = null) => ({ teamMemberId: id, battingOrder, position });

describe('snapshotLineup', () => {
  it('keeps only the batting order, sorted', () => {
    expect(snapshotLineup([row('b', 2), row('bench', null), row('a', 1, 'P')])).toEqual([
      { team_member_id: 'a', batting_order: 1, position: 'P' },
      { team_member_id: 'b', batting_order: 2, position: null },
    ]);
  });
});

describe('validateLineupForSubmit', () => {
  it('needs at least one batter', () => {
    expect(validateLineupForSubmit([row('a', null)], false)).toMatch(/at least one/);
  });

  it('T-ball only needs a batting order', () => {
    expect(validateLineupForSubmit([row('a', 1), row('b', 2)], false)).toBeNull();
  });

  it('stat leagues need a position for every batter', () => {
    expect(validateLineupForSubmit([row('a', 1, 'P'), row('b', 2)], true)).toMatch(/1 still needs one/);
  });

  it('stat leagues need exactly one pitcher', () => {
    expect(validateLineupForSubmit([row('a', 1, 'C'), row('b', 2, 'SS')], true)).toMatch(/who is pitching/);
    expect(validateLineupForSubmit([row('a', 1, 'P'), row('b', 2, 'P')], true)).toMatch(/Only one/);
    expect(validateLineupForSubmit([row('a', 1, 'P'), row('b', 2, 'SS')], true)).toBeNull();
  });
});

describe('lineupStatus', () => {
  const published = snapshotLineup([row('a', 1, 'P'), row('b', 2, 'C')]);

  it('none, then draft before the first submit', () => {
    expect(lineupStatus([], null)).toBe('none');
    expect(lineupStatus([row('a', 1)], null)).toBe('draft');
  });

  it('submitted when the draft matches the public copy', () => {
    expect(lineupStatus([row('b', 2, 'C'), row('a', 1, 'P'), row('c', null)], published)).toBe('submitted');
  });

  it('changed after reordering or a position swap', () => {
    expect(lineupStatus([row('a', 2, 'P'), row('b', 1, 'C')], published)).toBe('changed');
    expect(lineupStatus([row('a', 1, 'SS'), row('b', 2, 'C')], published)).toBe('changed');
  });
});

describe('publicPlayerName', () => {
  it('shows first name and last initial only', () => {
    expect(publicPlayerName('Johnny', 'walker')).toBe('Johnny W.');
    expect(publicPlayerName('Kai', null)).toBe('Kai');
  });
});

describe('isLineupPosition', () => {
  it('accepts real positions only', () => {
    expect(isLineupPosition('SS')).toBe(true);
    expect(isLineupPosition('QB')).toBe(false);
  });
});
