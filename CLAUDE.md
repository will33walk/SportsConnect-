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

## Plans and divisions

- Two plans, in `organization_billing.plan`: `league` ($35/month, one active
  season at a time, no divisions) and `unlimited` ($75/month, many seasons
  plus divisions under a parent league).
- **The limit is a trigger**, `enforce_plan_limits()` in 0009. A paywall that
  lives only in an action is one forgotten `if` from giving the product away,
  and this one has revenue behind it. Application code catches the raise with
  `isPlanLimit()` and shows the message — it does not reimplement the rule.
- The trigger's messages are written for a league director and name what
  Unlimited unlocks. Pass them through; never flatten one to "something went
  wrong". That text is read at the moment someone decides whether the upgrade
  is worth $40.
- Archiving is always allowed, even over the limit. Without that, an org that
  downgraded while holding two live seasons could not archive its way back
  inside the plan.
- Only `kind = 'league'` is metered. Camps, clinics and one-off events are
  unlimited on both plans.
- A division is a program with `parent_program_id` set. One level only, by
  trigger. Each division keeps its own teams, schedule, registration and
  roster model; the parent exists to group them and to be an address a blast
  can reach.
- Plan copy lives in `src/lib/plans.ts`. Don't scatter prices or feature lists
  through screens.

## Messaging

- A blast is an `announcements` row, not a thread. Threads are conversations;
  conflating them is how a parent replies "ok thanks" to four hundred people.
- Three audiences: the whole organization, one season or division (a parent
  league reaches every division under it), or picked teams.
- `announcement_audience()` resolves recipients and is used for both the
  pre-send count and the send itself, so the number shown is the number
  reached.
- Blasts go to adults — parents, guardians, coaches — never to player records.
- `send_announcement()` records, targets and fans out in one transaction. A
  failure partway through must not leave a blast that reached half a league.

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

See `docs/STRIPE.md` for setup and the webhook contract.

- Per-tenant Stripe Connect accounts. Registration money goes to the league,
  not through a platform account.
- **We never take a cut of a registration.** No `application_fee_amount`, no
  platform fee column, no service charge on a family. The league pays a flat
  monthly price; that is the product. `quote.platformFeeCents` is always 0 and
  exists so the breakdown can say so out loud.
- **The client never sends an amount.** The registration form posts which
  tier and which code; the server recomputes the price with the same
  `buildQuote()` the browser displayed. If those two could disagree, the bug
  is a mispriced charge.
- A registration row exists in `pending` before checkout and is promoted to
  `confirmed` only by the webhook — not by the browser returning. Pending
  holds the spot for 30 minutes.
- Capacity is enforced by `claim_registration_spot()`, which takes the program
  row's lock before counting. Any check that reads-then-inserts oversells on
  the night registration opens.
- `security definer` functions do the authorization RLS would have done.
  `claim_registration_spot()` verifies the dependent belongs to the caller's
  household — without that, it would register someone else's child.
- Prices and discounts are **stored on the registration** (`quote_lines`,
  `net_cents`), not recomputed. What a family paid in April is a fact about
  April, not a function of today's settings.

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
