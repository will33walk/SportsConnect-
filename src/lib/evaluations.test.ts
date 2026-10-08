import { describe, expect, it } from 'vitest';
import { isValidScore, overallOf, rankByOverall, scoreLabel, summarizePlayer, visibleCoachIds, type Evaluation } from './evaluations';

const ev = (o: Partial<Evaluation>): Evaluation => ({ registrationId: 'p1', coachId: 'c1', coachName: 'Coach', hitting: null, catching: null, throwing: null, fielding: null, iq: null, notes: null, saved: false, ...o });

describe('scores', () => {
  it('accepts whole numbers 1 to 10 only', () => {
    expect([1, 10].every(isValidScore)).toBe(true);
    expect([0, 11, 7.5, '7', null].some(isValidScore)).toBe(false);
  });
  it('averages only the skills a coach scored', () => {
    expect(overallOf(ev({ hitting: 8, fielding: 6 }))).toBe(7);
    expect(overallOf(ev({}))).toBeNull();
  });
  it('labels scores', () => {
    expect(scoreLabel(8)).toBe('8');
    expect(scoreLabel(7.4444)).toBe('7.4');
    expect(scoreLabel(null)).toBe('—');
  });
});

describe('summarizePlayer', () => {
  it('rolls coaches up equally and counts hearts', () => {
    const evals = [
      ev({ coachId: 'c1', hitting: 8, catching: 6, saved: true }), // overall 7
      ev({ coachId: 'c2', hitting: 6, catching: 6, throwing: 6, fielding: 6, iq: 6 }), // overall 6
      ev({ coachId: 'c3', notes: 'Late arrival', saved: true }), // no scores
      ev({ registrationId: 'p2', coachId: 'c1', hitting: 10 }),
    ];
    const s = summarizePlayer('p1', evals);
    expect(s.evaluators).toBe(2);
    expect(s.hearts).toBe(2);
    expect(s.skills.hitting).toBe(7);
    expect(s.skills.throwing).toBe(6);
    expect(s.overall).toBe(6.5);
    expect(summarizePlayer('nobody', evals)).toMatchObject({ evaluators: 0, hearts: 0, overall: null });
  });
});

describe('rankByOverall', () => {
  it('puts the highest first and unscored players last, keeping their order', () => {
    const rows = [{ id: 'a', overall: null }, { id: 'b', overall: 6 }, { id: 'c', overall: 9 }, { id: 'd', overall: null }, { id: 'e', overall: 6 }];
    expect(rankByOverall(rows).map((r) => r.id)).toEqual(['c', 'b', 'e', 'a', 'd']);
  });
});

describe('visibleCoachIds', () => {
  it('shares evaluations only between coaches on the same team', () => {
    const teams = [{ coachIds: ['head1', 'asst1'] }, { coachIds: ['head2', 'asst2'] }, { coachIds: ['head1', 'asst3'] }];
    expect(visibleCoachIds('asst1', teams).sort()).toEqual(['asst1', 'head1']);
    expect(visibleCoachIds('head1', teams).sort()).toEqual(['asst1', 'asst3', 'head1']);
    expect(visibleCoachIds('nobody', teams)).toEqual(['nobody']);
  });
});
