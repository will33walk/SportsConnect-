# SportsConnect — working conventions

Read `README.md` for what this is and `docs/LIFT.md` for where the code came
from. The rules below are the ones that bite if you skip them.

## Tenancy

- **Every org-scoped table carries `organization_id`** and has RLS policies
  written against `is_org_member()` / `has_org_role()` from
  `0001_tenancy.sql`. A table without both is a leak between customers.
- **`security definer` functions pin `search_path = public`.** One that
  doesn't is a privilege-escalation hole.
- Views that span tenants are created `with (security_invoker = true)`, or
  they run as the owner and read every tenant's rows.
- Application-level checks in `src/lib/auth.ts` are for early failure and
  rendering decisions. They are never the only thing enforcing access — RLS
  enforces the same rules independently.
- **Publication, not membership, is the public boundary.** A league's
  published schedule, rosters, standings and live games are readable with no
  account (`0005_public_read.sql`) — the person most likely to open a league
  page is a grandparent with a link. Anything about a family, a coach's draft
  board, or money stays shut regardless of publication.
- **A world-readable row holds nothing private.** RLS grants whole rows, and
  a column-level `REVOKE` does not override a table-level grant, so anything
  that must stay private goes in its own table. That is why billing is
  `organization_billing` and not columns on `organizations`.
- A non-member gets `notFound()`, not a 403. The difference between the two
  tells a stranger which leagues exist.

## Roles

- Five ordered roles: `member` < `coach` < `league_manager` < `admin` <
  `owner`. Check with `has_org_role(org, minimum)`, never by equality.
- Scoped grants (`team_coaches`, `game_scorekeepers`) answer "this team",
  "this game". The ladder answers "this organization". Don't use one for the
  other — a head coach is not a league manager.

## Coaches and rosters

- **Approval is not clearance.** An approved application means the league
  wants this person; clearance means every active `coach_requirements` row
  has an unexpired completion. Only clearance allows a team assignment, and
  a trigger on `team_coaches` enforces it — not the action, not the form.
- Clearance applies where `programs.involves_minors` is true. An adult
  softball captain is not a youth coach, and the rule knows the difference.
- `leagues.roster_model` decides how players reach a team: `draft` (coaches
  pick), `assigned` (the league places them), `team_registration` (a captain
  registers a team and invites their own players). Anything that builds a
  roster branches on it.
- A `team_members` row identifies someone by a registration, a user, or just
  a name — in a team-registration league the players never individually
  register, and a captain can write a teammate onto the sheet before that
  person has an account.
- Invitations carry roles, so they stop at `admin`. A captain's roster invite
  is the exception and is pinned to `role = 'member'` by its own policy: a
  mistyped address should never hand out authority.

## Games

- A game is an append-only log in `game_events`. Everything derived —
  scoreboard, count, stats, standings — is replayed. **Never store a derived
  value alongside the log.**
- `replay()` must be pure and total. A malformed event is skipped, not
  thrown on: a bad tap from a scorekeeper's phone must not take down the
  public follow view.
- `sanitize()` is the security boundary. It derives current state from the
  stored events itself rather than trusting anything the caller passes in.

## Sports

- A sport is a row in `sports` plus, optionally, a module under
  `src/lib/sports/<key>/` registered in `registry.ts`. A sport with no module
  still gets schedules, rosters, final scores and season stats.
- Sport-specific vocabulary stays inside that sport's directory. If adding a
  sport requires touching the schema, the abstraction is wrong — fix the
  abstraction.

## Schema and types

- Migrations are sequential numbered files in `supabase/migrations/`.
- **`src/lib/database.types.ts` is generated** (`npm run types:gen`).
  Never hand-edit it.

## Actions and errors

- `safeAction` wraps every Server Action: internal `_name` throws normally,
  `export const name = safeAction(_name)`. Next redacts thrown Server Action
  messages in production, so this is how an error reaches the UI.
- Any new public write path gets `checkRateLimit()` and validates size and
  type server-side.
- A route guarded by an env-var secret returns 500 when the secret is unset.
  Never "allow through until configured."

## Money

- Per-tenant Stripe Connect accounts. Registration money goes to the league,
  not through a platform account.
- Registration rows are written server-side after payment is validated.
  There is no client insert policy on `registrations`, deliberately.

## Design

- The visual system is in `src/app/globals.css`. Two registers: ruled paper
  for structure, the amber board for live state.
- **Amber (`--bulb`) means live.** It is rationed so the colour carries
  meaning. Don't use it for emphasis, warnings, or decoration.
- Structure comes from rules and alignment, not cards and shadows. There is
  one shadow in the system and it belongs to the board.
- Per-tenant colours arrive as `--tenant-brand` on `<html>`; read them
  through `--brand`, never hardcode a colour a league might want to change.

## Verification bar

`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` clean,
then a live check against a real Supabase project with disposable data —
including negative RLS cases with a non-admin JWT from a *different*
organization, which is the test that matters most here.
