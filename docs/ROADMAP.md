# Roadmap

Ordered by what unlocks a first paying league, not by what is most
interesting to build.

## Done

- Multi-tenant schema: organizations, memberships, the role ladder, policy
  helpers, and `create_organization()`.
- Sports core: programs, leagues, teams, rosters, households, pricing tiers,
  the question bank, promo codes, registrations, coach vetting.
- Games and stats: sessions, lineups, a sport-keyed stat catalog, the
  append-only event log, drafts, standings.
- Messaging: threads, participants, messages, notifications, push
  subscriptions.
- Domain logic lifted and regrouped, tests included.
- `SportEngine` contract, baseball adapter, sport registry.
- Visual system and per-tenant theming.
- Public read layer: published schedules, rosters, standings and live games
  are readable with no account, because the person most likely to open a
  league's page has none.
- Auth: session middleware, sign in, sign up, sign out.
- Onboarding: create a league, pick its address, land on a three-step setup.
- Per-league PWA manifests, so installing from a league's page puts that
  league on the home screen rather than ours.
- Stripe Connect: connected-account creation, hosted onboarding, status, the
  league's own dashboard, and a signature-verified webhook.
- Branding: a league sets its colours and sees them applied.

## Next, in order

**1. Invitations.** Getting a board and coaches into a league. Right now the
only way into an organization is to create it. Memberships, roles and the
policies behind them all exist; what's missing is the invite flow on top.

**2. Seasons and teams.** Create a season, add divisions and teams, generate
a schedule with the round-robin logic that's already here and tested.

**3. Registration.** Build the form from the question bank, apply tiers,
sibling discounts and promo codes, take payment through the league's
connected account, land the player on a roster.

**4. The draft.** The screens for the draft board, draft lists and
evaluations. The logic came over whole; none of it has a UI yet.

**5. Live tracking.** Wire the baseball engine to the scorekeeper screen and
the public follow view. Most of the logic is already here and tested; what is
missing is the screens and the polling route.

**6. Push notifications.** Subscriptions and the service worker, so an
installed league app can tell a parent a game moved.

**7. Basketball.** The second sport, and the real test of whether adding one
is configuration. If it needs schema changes, the abstraction was wrong.

## Deliberately not now

- SMS. The framework can be in place, but it is the one cost that scales with
  usage, so it stays off until pricing accounts for it.
- Hosted video. Leagues embed YouTube or Facebook streams; `stream_url` on a
  session is the whole feature. Hosting video would not survive this price.
- Running background checks. The product records that a check happened.
  Becoming a provider is a different, regulated business.
- Volleyball and soccer. They follow basketball's engine; building all three
  before one has a customer is how this stalls.
