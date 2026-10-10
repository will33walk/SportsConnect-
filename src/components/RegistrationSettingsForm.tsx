'use client';

import { useActionState, useState } from 'react';
import type { ActionResult } from '@/lib/safe-action';
import { money, processingFee } from '@/lib/quote';

interface Props {
  action: (formData: FormData) => Promise<ActionResult<{ ok: true }>>;
  capacity: number | null;
  feePolicy: 'league_absorbs' | 'family_pays';
  siblingEnabled: boolean;
  siblingType: 'percent' | 'flat';
  siblingRate: number | null;
  opensAt: string | null;
  closesAt: string | null;
}

const dateValue = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

export function RegistrationSettingsForm({
  action,
  capacity,
  feePolicy: initialFeePolicy,
  siblingEnabled,
  siblingType: initialSiblingType,
  siblingRate,
  opensAt,
  closesAt,
}: Props) {
  const [sibling, setSibling] = useState(siblingEnabled);
  const [siblingType, setSiblingType] = useState(initialSiblingType);
  const [feePolicy, setFeePolicy] = useState(initialFeePolicy);

  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; saved?: boolean } | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? { saved: true } : { error: result.error };
    },
    null,
  );

  // A worked example on a $90 season, so the choice isn't abstract.
  const sample = 9000;
  const fee = processingFee(sample);

  return (
    <form action={formAction} noValidate style={{ marginTop: '1rem' }}>
      <div className="field-row">
        <div className="field">
          <label htmlFor="registration_opens_at">Opens</label>
          <input
            id="registration_opens_at"
            name="registration_opens_at"
            type="date"
            defaultValue={dateValue(opensAt)}
          />
        </div>
        <div className="field">
          <label htmlFor="registration_closes_at">Closes</label>
          <input
            id="registration_closes_at"
            name="registration_closes_at"
            type="date"
            defaultValue={dateValue(closesAt)}
          />
        </div>
        <div className="field">
          <label htmlFor="capacity">Max players</label>
          <input
            id="capacity"
            name="capacity"
            type="number"
            min={1}
            defaultValue={capacity ?? ''}
            placeholder="No limit"
          />
          <p className="field-hint">Extra families go on a waitlist.</p>
        </div>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: '2rem 0 0' }}>
        <legend style={{ fontWeight: 600, color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}>
          Who covers card processing?
        </legend>
        <div className="ruled" style={{ borderTop: '1px solid var(--rule)', marginTop: '0.5rem' }}>
          <label className="row" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
            <input
              type="radio"
              name="fee_policy"
              value="league_absorbs"
              checked={feePolicy === 'league_absorbs'}
              onChange={() => setFeePolicy('league_absorbs')}
              style={{ marginTop: '0.35rem' }}
            />
            <span>
              <strong>We do</strong>
              <br />
              <span style={{ color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}>
                A {money(sample)} registration costs the family {money(sample)} and
                you keep {money(sample - fee)}.
              </span>
            </span>
          </label>
          <label className="row" style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
            <input
              type="radio"
              name="fee_policy"
              value="family_pays"
              checked={feePolicy === 'family_pays'}
              onChange={() => setFeePolicy('family_pays')}
              style={{ marginTop: '0.35rem' }}
            />
            <span>
              <strong>The family does</strong>
              <br />
              <span style={{ color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}>
                It&rsquo;s added at checkout as its own line and you keep the
                full {money(sample)}.
              </span>
            </span>
          </label>
        </div>
        <p className="field-hint">
          Either way, SportsConnect takes none of it.
        </p>
      </fieldset>

      <div className="field" style={{ marginTop: '2rem' }}>
        <label
          htmlFor="sibling_enabled"
          style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', fontWeight: 400, color: 'var(--ink)' }}
        >
          <input
            id="sibling_enabled"
            name="sibling_enabled"
            type="checkbox"
            checked={sibling}
            onChange={(e) => setSibling(e.target.checked)}
          />
          <span>Discount for a second child and beyond</span>
        </label>
      </div>

      {sibling && (
        <div className="field-row">
          <div className="field" style={{ flex: '0 1 8rem' }}>
            <label htmlFor="sibling_type">Type</label>
            <select
              id="sibling_type"
              name="sibling_type"
              value={siblingType}
              onChange={(e) => setSiblingType(e.target.value as 'percent' | 'flat')}
            >
              <option value="percent">% off</option>
              <option value="flat">$ off</option>
            </select>
          </div>
          <div className="field" style={{ flex: '0 1 8rem' }}>
            <label htmlFor="sibling_rate">Amount</label>
            <input
              id="sibling_rate"
              name="sibling_rate"
              type="text"
              defaultValue={
                siblingRate === null
                  ? ''
                  : initialSiblingType === 'flat'
                    ? (siblingRate / 100).toFixed(2)
                    : String(siblingRate)
              }
              placeholder={siblingType === 'percent' ? '50' : '25.00'}
            />
          </div>
        </div>
      )}

      {state?.error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1rem' }}>
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p role="status" style={{ color: 'var(--win)', marginTop: '1rem' }}>
          Saved.
        </p>
      )}

      <button className="btn" type="submit" disabled={pending} style={{ marginTop: '1.5rem' }}>
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  );
}
