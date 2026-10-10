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

- Invitations: token links, role-scoped, accepted into a membership.
- Coach applications: a public apply page, a review queue, and a per-coach
  requirement checklist with expiry.
- Coach clearance enforced by a database trigger on `team_coaches`, so no
  path — form, script, import, future bulk tool — can put an uncleared adult
  on a youth team.
- Three roster models (`draft`, `assigned`, `team_registration`), including
  team-level registration where a captain signs up a whole team and invites
  their own players.

- Seasons: create one with a sport and a roster model, add teams, generate a
  schedule across the nights a league actually has the field, and publish
  schedule, rosters and standings independently.
- Team pages: assign cleared coaches, with blocked ones listed and what each
  still owes; captain tools for inviting teammates or writing them in.

- Registration: a public program list and form built from the question bank,
  with a live itemised quote; automatic family discounts, promo codes,
  early-bird tiers, capacity with a waitlist, and payment through the
  league's own connected account. The quote states that we take no cut and
  names the card fee with its real number.
- A league's registration setup (prices, window, capacity, who covers the
  card fee, discount codes) and a ledger showing what was collected and what
  landed in their account.

## Next, in order

**2. Registration to roster.** Registration now takes money but doesn't yet
place anyone. Three paths out, one per roster model: into the draft pool,
onto a team the league assigns, or creating a team with its captain. The
assigned path needs a "place these players" screen; team_registration needs
the captain's team created at checkout.

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
