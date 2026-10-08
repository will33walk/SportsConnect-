# What came from MCParksConnect, and what didn't

MCParksConnect is a single-tenant municipal platform: one city, one Supabase
project, parks and recreation plus board meetings, parking, the zoo, golf,
facility rentals and employee scheduling. A lot of its youth-sports machinery
is genuinely good and took years of real seasons to get right. This records
what moved, what was rebuilt, and why — so nobody re-litigates it later.

## Lifted essentially intact

| What | Where it lives now |
|---|---|
| Live game engine — append-only event replay, 595 lines, tested | `src/lib/sports/baseball/engine.ts` |
| Round-robin scheduling | `src/lib/schedule.ts` |
| Lineup rules, including public name redaction | `src/lib/lineup.ts` |
| Live draft order and draft lists | `src/lib/draft.ts`, `src/lib/draft-list.ts` |
| Player evaluations | `src/lib/evaluations.ts` |
| Play-ups | `src/lib/play-up.ts` |
| Pricing tier availability | `src/lib/pricing.ts` |
| Health-info parsing and redaction | `src/lib/health-info.ts` |
| `safeAction` error wrapper | `src/lib/safe-action.ts` |
| Rate limiting | `src/lib/rate-limit.ts` |
| Supabase client helpers | `src/lib/supabase/` |

Their tests came with them. That is most of why they were worth lifting: the
rules are already encoded as executable examples, and a season of real use
has already found the edge cases.

Structural ideas that came over without any code: a shared `programs` table
with a `kind` discriminator; `leagues` as a 1:1 extension; the roster as a
registration placed on a team, so the undrafted pool needs no table of its
own; three independent publish timestamps instead of one status; standings
computed on read; per-game lineups rather than one reusable slot; the
reusable question-bank pattern; coach vetting as a requirement catalog plus
confirmations; per-resource grant tables as the escape hatch from role checks.

## Rebuilt from scratch

**Multi-tenancy.** The source had none. Not "partial", not "needs
generalizing" — zero `organization_id`/`tenant_id`/`org_id` columns across
161 migrations, and RLS was `has_role('park_administrator')` in 285 places: a
single global superadmin predicate with no row filter. What resembled tenancy
was `employees.branch`, a six-value department enum (`senior_center`, `golf`,
`maintenance`, `zoo`, `rec`, `admin`) scoping one city's staff to their own
departments. Useful inside one organization; meaningless between two. See
`0001_tenancy.sql`.

**The role ladder.** The source had one effective role plus tiers read off a
municipal HR table, via helpers like `isDirectorOfBranch('rec')`. Replaced
with five ordered roles and rank comparison, so a policy says "league_manager
or above" once. The per-resource grants (team coach, game scorekeeper) are
kept, because they are the part that was right.

**Payments.** The source used Square, correctly — the city already ran
parking, the zoo and rec programming on it. But `src/lib/square.ts` reads one
`SQUARE_ACCESS_TOKEN` and one `SQUARE_LOCATION_ID` from the environment: a
single-merchant design. A platform taking money for many leagues needs each
one receiving its own payouts, so this is Stripe Connect. The pricing logic
sitting on top — tiers, sibling discounts — carried over; only the rail
changed.

**Promo codes.** Did not exist. The source's only discounting was sibling and
household rate. Added in `0002_sports_core.sql`.

**Tenant signup.** Did not exist. Parents could self-register; admins were
provisioned by hand, which is correct for a city and fatal for a SaaS.
`create_organization()` makes the caller the owner of a new org in one
transaction — an org with no owner is unreachable, so those two writes must
not be separable.

**Theming.** The source had a clean token system in `globals.css` with the
municipality's own lake-and-navy palette hardcoded on `:root`, no per-tenant
override, and `America/Chicago` in 33 files. Here colours come from the
organization row as CSS custom properties, and every org carries its own
timezone.

**Sport genericity.** The engine's architecture is sport-agnostic; its
vocabulary is not. `PitchResult`, `Base = 1|2|3`, `Half`, and a
`stat_type in ('batting','pitching')` constraint are baseball's. Baseball is
now one module behind `SportEngine`, sports are rows rather than a constraint,
and the stat catalog is keyed by sport.

## Left behind

Board meetings and minutes (BoardFlow), document e-signing, the vendor and
farmers-market portal, facility rentals and venue management, parking passes,
employee HR and shift scheduling, work orders and assets, self-guided tours,
municipal finance exports, the civic discover feed, and the T-ball photo
booth.

A thin field-booking module may be worth building later — leagues do fight
over diamonds — but the source's version is wired to a venue hierarchy and
Square invoicing, so it would be a new thing wearing an old name.

## One practical note

`src/lib` and `src/components` in the source are flat: 263 components in a
single directory, 69 action modules in another, no module boundaries. That is
why this lift was file-by-file rather than copying a directory, and why this
project groups by domain (`src/lib/sports/<sport>/`) from the first commit.
