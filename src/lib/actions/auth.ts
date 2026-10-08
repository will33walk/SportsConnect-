'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeAction } from '@/lib/safe-action';

// `next` comes from a query string, so it is attacker-controlled. Only a
// same-origin path is ever honoured: anything with a scheme, a host, or a
// protocol-relative prefix falls back to /app. Without this, a crafted link
// turns the sign-in page into an open redirect.
function safeNext(next: string | null | undefined): string {
  if (!next) return '/app';
  if (!next.startsWith('/') || next.startsWith('//')) return '/app';
  return next;
}

async function _signIn(formData: FormData): Promise<never> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = safeNext(formData.get('next') as string | null);

  if (!email || !password) throw new Error('Enter your email and password.');

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  // Deliberately one message for both "no such account" and "wrong password".
  // Telling them apart lets anyone check whether a given parent has an account
  // here, which is not ours to disclose.
  if (error) throw new Error('That email and password don’t match.');

  redirect(next);
}

async function _signUp(formData: FormData): Promise<never> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fullName = String(formData.get('full_name') ?? '').trim();
  const next = safeNext(formData.get('next') as string | null);

  if (!email || !password) throw new Error('Enter your email and a password.');
  // Supabase enforces its own minimum; this is so the message is ours and
  // arrives before the round trip.
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  if (!fullName) throw new Error('Enter your name.');

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    // Read by the handle_new_user() trigger to seed the profile row.
    options: { data: { full_name: fullName } },
  });

  if (error) throw new Error(error.message);

  // Usually /app, but someone who arrived from an invitation link goes back
  // to it so they land in the league they were invited to rather than on an
  // empty "you're not in any leagues yet" screen.
  redirect(next);
}

async function _signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

export const signIn = safeAction(_signIn);
export const signUp = safeAction(_signUp);
export const signOut = safeAction(_signOut);
