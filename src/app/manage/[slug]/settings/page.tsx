import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { BrandingForm } from '@/components/BrandingForm';
import { getOrgBySlug } from '@/lib/org-data';
import { hasOrgRole } from '@/lib/auth';
import { updateBranding } from '@/lib/actions/organizations';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const org = await getOrgBySlug(slug);
  if (!org) notFound();

  const canEdit = await hasOrgRole(slug, 'admin');
  const save = updateBranding.bind(null, slug);

  return (
    <div className="shell" style={{ paddingBlock: '2.5rem', maxWidth: '44rem' }}>
      <h1 style={{ fontSize: 'var(--step-3)' }}>Settings</h1>

      <section style={{ marginTop: '2.5rem' }}>
        <h2>Your league&rsquo;s look</h2>
        <p style={{ color: 'var(--ink-soft)', marginTop: '0.5rem' }}>
          Your colours show on every page families see, and on the app icon when
          they add your league to their home screen.
        </p>

        {canEdit ? (
          <BrandingForm
            action={save}
            initialPrimary={org.brandPrimary}
            initialAccent={org.brandAccent}
          />
        ) : (
          <p style={{ color: 'var(--ink-faint)', marginTop: '1.5rem' }}>
            An owner or admin of this league changes this.
          </p>
        )}
      </section>

      <section style={{ marginTop: '3.5rem' }}>
        <h2>Address and time zone</h2>
        <dl className="ruled rule-heavy" style={{ margin: '1rem 0 0' }}>
          <Detail label="Web address" value={`/l/${org.slug}`} />
          <Detail label="Time zone" value={org.timezone} />
        </dl>
        <p className="field-hint" style={{ marginTop: '1rem' }}>
          Changing your web address would break every link and QR code already
          handed out, so it isn&rsquo;t something you can do here. Get in touch
          if you need it moved.
        </p>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <dt style={{ color: 'var(--ink-soft)' }}>{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </div>
  );
}
