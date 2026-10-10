'use client';

import { useActionState, useMemo, useState, useTransition } from 'react';
import type { ActionResult } from '@/lib/safe-action';
import { buildQuote, type FeePolicy, type PromoCode, type SiblingRule, type Tier } from '@/lib/quote';
import { QuotePanel } from '@/components/QuotePanel';
import type { Dependent, RegistrationQuestion } from '@/lib/registration-data';

interface Props {
  action: (formData: FormData) => Promise<ActionResult<never>>;
  checkPromo: (code: string) => Promise<ActionResult<{ promo: PromoCode } | { problem: string }>>;
  tiers: Tier[];
  questions: RegistrationQuestion[];
  dependents: Dependent[];
  involvesMinors: boolean;
  sibling: SiblingRule | null;
  /** How many of this family's children are already registered. */
  siblingsAlreadyIn: number;
  feePolicy: FeePolicy;
  /** True when the program is full — the form takes waitlist names instead. */
  waitlist: boolean;
}

export function RegistrationForm({
  action,
  checkPromo,
  tiers,
  questions,
  dependents,
  involvesMinors,
  sibling,
  siblingsAlreadyIn,
  feePolicy,
  waitlist,
}: Props) {
  const [tierId, setTierId] = useState(tiers[0]?.id ?? '');
  const [who, setWho] = useState(dependents[0]?.id ?? 'new');
  const [promo, setPromo] = useState<PromoCode | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();

  const [error, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await action(formData);
      return result.ok ? null : result.error;
    },
    null,
  );

  const tier = tiers.find((t) => t.id === tierId) ?? tiers[0];

  // The same function the server charges from. Running it here is what makes
  // the total update as they pick, with no risk of the two disagreeing.
  const quote = useMemo(
    () =>
      tier
        ? buildQuote({
            tier,
            childNumber: siblingsAlreadyIn + 1,
            sibling,
            promo,
            feePolicy,
          })
        : null,
    [tier, siblingsAlreadyIn, sibling, promo, feePolicy],
  );

  function applyCode() {
    const code = promoInput.trim();
    if (!code) return;

    startChecking(async () => {
      const result = await checkPromo(code);
      if (!result.ok) {
        setPromoMessage(result.error);
        return;
      }
      if ('problem' in result.data) {
        setPromo(null);
        setPromoMessage(result.data.problem);
        return;
      }
      setPromo(result.data.promo);
      setPromoMessage(null);
    });
  }

  return (
    <form action={formAction} noValidate>
      {/* Who */}
      {involvesMinors && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend
            style={{ fontWeight: 600, color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}
          >
            Who are you registering?
          </legend>

          <div className="ruled" style={{ borderTop: '1px solid var(--rule)', marginTop: '0.5rem' }}>
            {dependents.map((d) => (
              <label key={d.id} className="row" style={{ cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="dependent_id"
                  value={d.id}
                  checked={who === d.id}
                  onChange={() => setWho(d.id)}
                />
                <span>
                  {d.firstName} {d.lastName}
                </span>
              </label>
            ))}
            <label className="row" style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="dependent_id"
                value="new"
                checked={who === 'new'}
                onChange={() => setWho('new')}
              />
              <span>{dependents.length > 0 ? 'Someone else' : 'Add your player'}</span>
            </label>
          </div>

          {who === 'new' && (
            <div style={{ marginTop: '1rem' }}>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="child_first_name">First name</label>
                  <input id="child_first_name" name="child_first_name" type="text" required />
                </div>
                <div className="field">
                  <label htmlFor="child_last_name">Last name</label>
                  <input id="child_last_name" name="child_last_name" type="text" required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="child_dob">Date of birth</label>
                <input id="child_dob" name="child_dob" type="date" />
                <p className="field-hint">Used for age divisions.</p>
              </div>
            </div>
          )}
        </fieldset>
      )}

      {/* Price options. A single option isn't a choice, so it's stated rather
          than presented as a radio group with one item in it. */}
      {tiers.length > 1 ? (
        <fieldset style={{ border: 0, padding: 0, margin: '2.5rem 0 0' }}>
          <legend
            style={{ fontWeight: 600, color: 'var(--ink-soft)', fontSize: 'var(--step--1)' }}
          >
            Choose an option
          </legend>
          <div className="ruled" style={{ borderTop: '1px solid var(--rule)', marginTop: '0.5rem' }}>
            {tiers.map((t) => (
              <label
                key={t.id}
                className="row"
                style={{ cursor: 'pointer', justifyContent: 'space-between' }}
              >
                <span style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <input
                    type="radio"
                    name="pricing_tier_id"
                    value={t.id}
                    checked={tierId === t.id}
                    onChange={() => setTierId(t.id)}
                  />
                  {t.label}
                </span>
                <span style={{ fontWeight: 600 }}>${(t.amountCents / 100).toFixed(2)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        tier && <input type="hidden" name="pricing_tier_id" value={tier.id} />
      )}

      {/* Questions the league asks */}
      {questions.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          {questions.map((q) => (
            <QuestionField key={q.id} question={q} />
          ))}
        </div>
      )}

      {/* Promo code */}
      {tier && tier.amountCents > 0 && (
        <div className="field" style={{ marginTop: '2rem' }}>
          <label htmlFor="promo_code">Have a code?</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', maxWidth: '24rem' }}>
            <input
              id="promo_code"
              name="promo_code"
              type="text"
              value={promoInput}
              onChange={(e) => {
                setPromoInput(e.target.value);
                // Typing after applying one invalidates it, so the panel
                // can't show a discount for a code that's since been edited.
                if (promo) {
                  setPromo(null);
                  setPromoMessage(null);
                }
              }}
              autoCapitalize="characters"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-quiet"
              onClick={applyCode}
              disabled={checking || !promoInput.trim()}
              style={{ padding: '0.4rem 0.8rem', fontSize: 'var(--step--1)' }}
            >
              {checking ? 'Checking…' : 'Apply'}
            </button>
          </div>
          {promoMessage && (
            <p className="field-hint" style={{ color: 'var(--loss)' }}>
              {promoMessage}
            </p>
          )}
          {promo && (
            <p className="field-hint" style={{ color: 'var(--win)' }}>
              Code applied.
            </p>
          )}
        </div>
      )}

      {quote && (
        <QuotePanel
          quote={quote}
          feeNote={
            feePolicy === 'league_absorbs' && quote.totalCents > 0
              ? 'Card processing comes out of the league’s side, not yours.'
              : undefined
          }
        />
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--loss)', marginTop: '1.5rem' }}>
          {error}
        </p>
      )}

      <button className="btn" type="submit" disabled={pending || !tier} style={{ marginTop: '1.5rem' }}>
        {pending
          ? 'Just a moment…'
          : waitlist
            ? 'Join the waitlist'
            : quote?.totalCents === 0
              ? 'Complete registration'
              : 'Continue to payment'}
      </button>

      {!waitlist && quote && quote.totalCents > 0 && (
        <p className="field-hint" style={{ marginTop: '0.75rem' }}>
          You&rsquo;ll pay on the league&rsquo;s secure Stripe page. Your spot
          is held while you do.
        </p>
      )}
    </form>
  );
}

function QuestionField({ question: q }: { question: RegistrationQuestion }) {
  const name = `q_${q.id}`;
  const hintId = q.helpText ? `${name}-hint` : undefined;

  return (
    <div className="field">
      <label htmlFor={name}>
        {q.label}
        {!q.required && (
          <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}> — optional</span>
        )}
      </label>

      {q.fieldType === 'long_text' ? (
        <textarea id={name} name={name} rows={4} required={q.required} aria-describedby={hintId} />
      ) : q.fieldType === 'select' ? (
        <select id={name} name={name} required={q.required} defaultValue="" aria-describedby={hintId}>
          <option value="" disabled>
            Choose one
          </option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : q.fieldType === 'multi_select' ? (
        <span style={{ display: 'grid', gap: '0.4rem', marginTop: '0.25rem' }}>
          {(q.options ?? []).map((o) => (
            <label key={o} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="checkbox" name={name} value={o} />
              <span>{o}</span>
            </label>
          ))}
        </span>
      ) : q.fieldType === 'checkbox' ? (
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
          <input id={name} name={name} type="checkbox" value="yes" required={q.required} />
          <span style={{ color: 'var(--ink-soft)' }}>Yes</span>
        </label>
      ) : (
        <input
          id={name}
          name={name}
          type={q.fieldType === 'date' ? 'date' : 'text'}
          required={q.required}
          aria-describedby={hintId}
        />
      )}

      {q.helpText && (
        <p id={hintId} className="field-hint">
          {q.helpText}
        </p>
      )}
    </div>
  );
}
