// Pure helpers (no 'use server') for guardian phone numbers and the
// per-person health/emergency fields added in 0126. Unit-tested in
// health-info.test.ts.

// "(219) 555-0100" for US 10-digit numbers (a leading 1 is dropped);
// anything else with 7-15 digits is kept as typed. Returns null for blank,
// or an Error message string for something that isn't a phone number.
export function normalizePhone(input: string | null | undefined): { value: string | null } | { error: string } {
  const raw = (input ?? '').trim();
  if (!raw) return { value: null };
  const digits = raw.replace(/\D/g, '');
  const us = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (us.length === 10 && !raw.startsWith('+')) return { value: `(${us.slice(0, 3)}) ${us.slice(3, 6)}-${us.slice(6)}` };
  if (digits.length >= 7 && digits.length <= 15) return { value: raw.slice(0, 30) };
  return { error: 'Enter a phone number with area code, like (219) 555-0100.' };
}

export interface HealthInfo {
  allergies: string | null;
  medical_notes: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

const clean = (value: FormDataEntryValue | null, max: number) => {
  const text = String(value ?? '').trim().replace(/\s+\n/g, '\n');
  return text ? text.slice(0, max) : null;
};

// Reads the health fields from a form. "None" / "N/A" style answers are
// stored as blank so coaches don't see a warning for "no allergies".
export function parseHealthForm(formData: FormData): { value: HealthInfo } | { error: string } {
  const noneLike = /^(none|no|n\/?a|nka|no known allergies|nope|-+)\.?$/i;
  const allergies = clean(formData.get('allergies'), 1000);
  const phone = normalizePhone(String(formData.get('emergency_contact_phone') ?? ''));
  if ('error' in phone) return { error: `Emergency contact: ${phone.error}` };
  return {
    value: {
      allergies: allergies && noneLike.test(allergies) ? null : allergies,
      medical_notes: clean(formData.get('medical_notes'), 2000),
      emergency_contact_name: clean(formData.get('emergency_contact_name'), 120),
      emergency_contact_phone: phone.value,
    },
  };
}
