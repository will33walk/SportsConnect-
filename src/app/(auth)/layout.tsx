import Link from 'next/link';

// Sign-in and sign-up share a narrow single-column page. No marketing rail
// alongside the form: someone arriving here has already decided.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell" style={{ maxWidth: '32rem', paddingBlock: 'clamp(3rem, 12vh, 7rem)' }}>
      <Link
        href="/"
        style={{
          fontWeight: 700,
          fontStretch: '125%',
          fontSize: 'var(--step-1)',
          textDecoration: 'none',
        }}
      >
        SportsConnect
      </Link>
      <div style={{ marginTop: '3rem' }}>{children}</div>
    </div>
  );
}
