import { describe, expect, it } from 'vitest';
import { slugify, validateSlug } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Michigan City Youth Baseball')).toBe('michigan-city-youth-baseball');
  });

  it('strips punctuation and apostrophes', () => {
    expect(slugify("St. Mary's Rec League!")).toBe('st-marys-rec-league');
  });

  it('folds accents rather than dropping the letter', () => {
    expect(slugify('Peñasco Little League')).toBe('penasco-little-league');
  });

  it('collapses runs of separators', () => {
    expect(slugify('North   County __ Hoops')).toBe('north-county-hoops');
  });

  it('never ends in a hyphen, even when the cut lands on one', () => {
    // 40 chars would land mid-word and leave a trailing hyphen.
    const long = slugify('a'.repeat(39) + ' bravo');
    expect(long.endsWith('-')).toBe(false);
    expect(long.length).toBeLessThanOrEqual(40);
  });

  it('produces something the schema check accepts', () => {
    const slug = slugify('  --Spring 2027 Rec!! --  ');
    expect(validateSlug(slug)).toBeNull();
    expect(slug).toMatch(/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/);
  });
});

describe('validateSlug', () => {
  it('rejects slugs that would collide with product routes', () => {
    expect(validateSlug('manage')).not.toBeNull();
    expect(validateSlug('signup')).not.toBeNull();
  });

  it('rejects too short', () => {
    expect(validateSlug('ab')).not.toBeNull();
  });

  it('rejects leading and trailing hyphens', () => {
    expect(validateSlug('-rec')).not.toBeNull();
    expect(validateSlug('rec-')).not.toBeNull();
  });

  it('accepts an ordinary league address', () => {
    expect(validateSlug('mcybl')).toBeNull();
    expect(validateSlug('north-county-hoops-2027')).toBeNull();
  });
});
