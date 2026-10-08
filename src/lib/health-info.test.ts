import { describe, it, expect } from 'vitest';
import { normalizePhone, parseHealthForm } from './health-info';

describe('normalizePhone', () => {
  it('formats US numbers however they were typed', () => {
    expect(normalizePhone('2195550100')).toEqual({ value: '(219) 555-0100' });
    expect(normalizePhone('1-219-555-0100')).toEqual({ value: '(219) 555-0100' });
    expect(normalizePhone('219.555.0100')).toEqual({ value: '(219) 555-0100' });
  });

  it('keeps international numbers as typed', () => {
    expect(normalizePhone('+44 20 7946 0958')).toEqual({ value: '+44 20 7946 0958' });
  });

  it('treats blank as no phone and rejects junk', () => {
    expect(normalizePhone('  ')).toEqual({ value: null });
    expect(normalizePhone('555')).toHaveProperty('error');
  });
});

describe('parseHealthForm', () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };

  it('keeps real allergies and formats the emergency phone', () => {
    expect(parseHealthForm(form({ allergies: 'Peanuts (EpiPen in bag)', emergency_contact_name: 'Aunt Jo', emergency_contact_phone: '2195550199' }))).toEqual({
      value: { allergies: 'Peanuts (EpiPen in bag)', medical_notes: null, emergency_contact_name: 'Aunt Jo', emergency_contact_phone: '(219) 555-0199' },
    });
  });

  it('stores "none" style answers as blank so coaches see no warning', () => {
    for (const none of ['None', 'n/a', 'NKA', 'no']) {
      const result = parseHealthForm(form({ allergies: none }));
      expect('value' in result && result.value.allergies).toBeNull();
    }
  });

  it('rejects a bad emergency phone', () => {
    expect(parseHealthForm(form({ emergency_contact_phone: '12' }))).toHaveProperty('error');
  });
});
