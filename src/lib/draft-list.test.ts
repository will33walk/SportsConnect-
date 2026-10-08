import { describe, expect, it } from 'vitest';
import { cleanList, moveItem, nextAutoPick, rankForDraft, starterList, type DraftPlayer } from './draft-list';

const p = (o: Partial<DraftPlayer>): DraftPlayer => ({ registrationId: 'x', name: 'X', age: 10, overall: null, hearted: false, draftedBy: null, ...o });
const pool = [
  p({ registrationId: 'a', name: 'Avery', overall: 6 }),
  p({ registrationId: 'b', name: 'Brooks', overall: 9, hearted: true }),
  p({ registrationId: 'c', name: 'Casey', overall: null }),
  p({ registrationId: 'd', name: 'Dana', overall: 7, hearted: true }),
  p({ registrationId: 'e', name: 'Eli', overall: 8, hearted: true, draftedBy: 'Tigers' }),
];

describe('rankForDraft / starterList', () => {
  it('puts hearted players first, then by score, unscored last', () => {
    expect(rankForDraft(pool).map((x) => x.registrationId)).toEqual(['b', 'e', 'd', 'a', 'c']);
  });
  it('starts a list from the team’s hearted players who are still available', () => {
    expect(starterList(pool)).toEqual(['b', 'd']);
  });
});

describe('list editing', () => {
  it('drops players no longer in the league and duplicates, keeping order', () => {
    expect(cleanList(['d', 'gone', 'b', 'd', 'a'], new Set(['a', 'b', 'd']))).toEqual(['d', 'b', 'a']);
  });
  it('moves a player up, down and to the top', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 99)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 5, 0)).toEqual(['a', 'b', 'c']);
  });
});

describe('nextAutoPick', () => {
  const best = rankForDraft(pool);
  it('takes the first player on the list who is still available', () => {
    expect(nextAutoPick(['e', 'd', 'a'], new Set(['e']), best)).toBe('d');
  });
  it('falls back to the best-evaluated player left when the list is empty or used up', () => {
    expect(nextAutoPick([], new Set(['b', 'e']), best)).toBe('d');
    expect(nextAutoPick(['b'], new Set(['b', 'e', 'd']), best)).toBe('a');
    expect(nextAutoPick([], new Set(['a', 'b', 'c', 'd', 'e']), best)).toBeNull();
  });
});
