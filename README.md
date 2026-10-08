# SportsConnect

League management for small youth sports organizations — rosters, schedules,
registration, live scores and season stats — at a flat monthly price with no
cut taken out of registration money.

The market position is the whole product strategy: the incumbents are built
for state associations and federations, priced accordingly, and then charge
3–5.5% on every payment that passes through them. A volunteer-run rec league
with 350 kids is paying enterprise prices for compliance machinery it will
never open. This is the same job done for the bottom of that market.

## Status

Foundations. The schema, the domain logic and the design system are in; the
application screens are not. See `docs/ROADMAP.md`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase
(Postgres + Auth + Storage + RLS) · Stripe Connect · Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in the Supabase and Stripe values
npm run dev
```

Apply the migrations in `supabase/migrations/` in order, then regenerate
types:

```bash
npm run types:gen
```

## Verification bar

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

`src/lib/database.types.ts` is **generated**, not hand-written. Regenerate it
after every migration rather than editing it.

## Layout

```
src/lib/sports/          one directory per sport
  types.ts               the SportEngine contract every sport implements
  registry.ts            which sports support live tracking
  baseball/engine.ts     the event-sourced baseball engine (pure, tested)
  baseball/adapter.ts    baseball expressed as a SportEngine
src/lib/auth.ts          org membership and the role ladder
src/lib/theme.ts         per-tenant branding -> CSS custom properties
supabase/migrations/     sequential, numbered, applied in order
```

## Two things to know before changing anything

**Tenancy is not optional.** Every org-scoped table carries
`organization_id`, and every policy is written in terms of `is_org_member()`
and `has_org_role()` from `0001_tenancy.sql`. A new table without an
`organization_id` and a policy is a data leak between customers, not a
missing feature.

**A game is an append-only log.** Scores, counts, baserunners and stats are
replayed from `game_events`, never stored alongside it. That is what makes
undo a deletion and what keeps the scorekeeper's screen, the public follow
view and the stat sheet from ever disagreeing. Don't add a derived column.

## Provenance

The domain logic here was lifted from MCParksConnect, a single-tenant
municipal parks platform by the same author, and substantially reworked.
`docs/LIFT.md` records what came over, what was rebuilt, and why.
