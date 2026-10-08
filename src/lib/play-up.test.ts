import { describe, expect, it } from 'vitest';
import { PLAY_UP_RULES, playUpDecisionNotice, playUpRulesFor, summarizePlayUps } from './play-up';

describe('playUpRulesFor', () => {
  it('uses the league’s own lines, or the standard list when empty', () => {
    expect(playUpRulesFor('- Evaluation is March 6.\n\n• Ask the coach first.  ')).toEqual(['Evaluation is March 6.', 'Ask the coach first.']);
    expect(playUpRulesFor('   ')).toBe(PLAY_UP_RULES);
    expect(playUpRulesFor(null)).toBe(PLAY_UP_RULES);
  });
});

describe('playUpDecisionNotice', () => {
  const base = { playerName: 'Johnny W.', leagueTitle: 'YBL 8U', targetTitle: 'YBL 11U' };
  it('tells the family the fee and that the player moves up once it is paid', () => {
    const n = playUpDecisionNotice({ ...base, approved: true, feeDueCents: 1000, note: null });
    expect(n.title).toBe('Play-up approved for Johnny W.');
    expect(n.body).toContain('approved to play up to YBL 11U');
    expect(n.body).toContain('play-up fee is $10');
    expect(n.body).toContain('moves up once it’s paid');
    expect(playUpDecisionNotice({ ...base, approved: true, feeDueCents: 0, note: null }).body).toContain('no extra fee');
  });
  it('keeps a denied player in their own league and passes the reason on', () => {
    const n = playUpDecisionNotice({ ...base, approved: false, feeDueCents: 0, note: 'Needs another season at 8U.' });
    expect(n.body).toBe('Johnny W. stays in YBL 8U. Needs another season at 8U.');
  });
});

describe('summarizePlayUps', () => {
  it('counts by the league the family signed up for', () => {
    const rows = summarizePlayUps([
      { fromProgramId: 'tb', fromTitle: 'Teeball', status: 'requested', feeDueCents: null, paidAt: null },
      { fromProgramId: 'tb', fromTitle: 'Teeball', status: 'approved', feeDueCents: 1000, paidAt: '2027-03-01' },
      { fromProgramId: 'tb', fromTitle: 'Teeball', status: 'approved', feeDueCents: 1000, paidAt: null },
      { fromProgramId: '8u', fromTitle: '8U', status: 'denied', feeDueCents: null, paidAt: null },
    ]);
    expect(rows).toEqual([
      { leagueId: '8u', league: '8U', requested: 0, approved: 0, denied: 1, total: 1, differenceBilledCents: 0, differencePaidCents: 0 },
      { leagueId: 'tb', league: 'Teeball', requested: 1, approved: 2, denied: 0, total: 3, differenceBilledCents: 2000, differencePaidCents: 1000 },
    ]);
  });
});
