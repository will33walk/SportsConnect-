import { describe, expect, it } from 'vitest';
import { zonedToUtc } from './timezone';

describe('zonedToUtc', () => {
  it('resolves against the zone, not the server', () => {
    expect(zonedToUtc('2027-04-06T18:00', 'America/New_York')).toBe('2027-04-06T22:00:00.000Z');
    expect(zonedToUtc('2027-06-01T18:00', 'America/Los_Angeles')).toBe('2027-06-02T01:00:00.000Z');
  });

  it('uses the offset in force on that date, not today’s', () => {
    // Same wall clock, four hours apart in UTC, because one is in daylight
    // time and the other isn't. A season spanning April to October hits both.
    expect(zonedToUtc('2027-01-06T18:00', 'America/New_York')).toBe('2027-01-06T23:00:00.000Z');
    expect(zonedToUtc('2027-04-06T18:00', 'America/New_York')).toBe('2027-04-06T22:00:00.000Z');
  });

  it('handles Indiana, which has its own history with this', () => {
    expect(zonedToUtc('2027-07-15T19:30', 'America/Indiana/Indianapolis')).toBe(
      '2027-07-15T23:30:00.000Z',
    );
    expect(zonedToUtc('2027-12-15T19:30', 'America/Indiana/Indianapolis')).toBe(
      '2027-12-16T00:30:00.000Z',
    );
  });

  it('survives times either side of a daylight-saving change', () => {
    // 2027-03-14 is the US spring-forward date.
    expect(zonedToUtc('2027-03-14T01:30', 'America/New_York')).toBe('2027-03-14T06:30:00.000Z');
    expect(zonedToUtc('2027-03-14T10:00', 'America/New_York')).toBe('2027-03-14T14:00:00.000Z');
    // 2027-11-07 is fall-back; 01:30 happens twice and we take the first.
    expect(zonedToUtc('2027-11-07T01:30', 'America/New_York')).toBe('2027-11-07T05:30:00.000Z');
  });

  it('round-trips back to the wall clock it was given', () => {
    const cases: [string, string][] = [
      ['2027-04-06T18:00', 'America/New_York'],
      ['2027-12-15T19:30', 'America/Indiana/Indianapolis'],
      ['2027-06-01T18:00', 'America/Los_Angeles'],
      ['2027-03-14T10:00', 'America/New_York'],
    ];

    for (const [local, tz] of cases) {
      const rendered = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .format(new Date(zonedToUtc(local, tz)))
        .replace(', ', 'T');

      expect(rendered).toBe(local);
    }
  });

  it('refuses nonsense rather than returning an invalid date', () => {
    expect(() => zonedToUtc('not-a-date', 'America/New_York')).toThrow();
  });
});
