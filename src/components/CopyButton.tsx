'use client';

import { useState } from 'react';

/**
 * Copies a link to the clipboard.
 *
 * Invitations are delivered by the league, not by us: there is no mail
 * sending wired up yet, so the honest interface is "here is the link, send it
 * however you already talk to these people." Most volunteer boards run on
 * group texts anyway.
 */
export function CopyButton({ value, label = 'Copy link' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some browsers and over plain HTTP.
      // Select the text instead so they can copy it by hand rather than
      // being told nothing happened.
      window.prompt('Copy this link', value);
    }
  }

  return (
    <button
      type="button"
      className="btn btn-quiet"
      onClick={copy}
      style={{ padding: '0.3rem 0.65rem', fontSize: 'var(--step--1)' }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
