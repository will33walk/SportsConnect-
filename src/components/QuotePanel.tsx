'use client';

import { money, type Quote } from '@/lib/quote';

/**
 * The price, itemised, before anyone commits.
 *
 * This panel is the product's argument in one place. A parent on a league
 * platform usually sees a sticker price, then a surprise service fee at the
 * last screen, and never finds out what the league actually received. So:
 * every line is shown as it accrues, the discount says it applied itself, the
 * card fee is named with its real number, and the "no booking fee" line is
 * stated rather than left to be inferred from its absence.
 *
 * Rendered from the same buildQuote() the server charges from, so what's on
 * screen and what hits the card cannot drift.
 */
export function QuotePanel({ quote, feeNote }: { quote: Quote; feeNote?: string }) {
  const free = quote.totalCents === 0;

  return (
    <div
      style={{
        borderTop: '2px solid var(--ink)',
        paddingTop: '0.75rem',
        marginTop: '2rem',
      }}
    >
      <dl style={{ margin: 0 }}>
        {quote.lines.map((line, i) => (
          <div key={i} style={{ padding: '0.4rem 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <dt style={{ color: line.amountCents < 0 ? 'var(--win)' : 'var(--ink)' }}>
                {line.label}
              </dt>
              <dd
                style={{
                  margin: 0,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: line.amountCents < 0 ? 'var(--win)' : 'var(--ink)',
                }}
              >
                {money(line.amountCents)}
              </dd>
            </div>
            {line.note && (
              <p
                style={{
                  margin: '0.15rem 0 0',
                  fontSize: 'var(--step--1)',
                  color: 'var(--ink-faint)',
                }}
              >
                {line.note}
              </p>
            )}
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '1rem',
            borderTop: '1px solid var(--rule)',
            marginTop: '0.5rem',
            paddingTop: '0.75rem',
          }}
        >
          <dt style={{ fontWeight: 700, fontStretch: '125%', fontSize: 'var(--step-1)' }}>
            {free ? 'No charge' : 'Total today'}
          </dt>
          <dd
            style={{
              margin: 0,
              fontWeight: 700,
              fontStretch: '125%',
              fontSize: 'var(--step-2)',
              whiteSpace: 'nowrap',
            }}
          >
            {money(quote.totalCents)}
          </dd>
        </div>
      </dl>

      {/* The line the incumbents can't write. Stated plainly, once, at the
          bottom -- not as a badge or a banner. */}
      <p
        style={{
          fontSize: 'var(--step--1)',
          color: 'var(--ink-faint)',
          marginTop: '1rem',
          marginBottom: 0,
        }}
      >
        No booking fee and no service charge. SportsConnect takes no percentage
        of your registration — the league pays a flat monthly price instead.
        {feeNote ? ` ${feeNote}` : ''}
      </p>
    </div>
  );
}
