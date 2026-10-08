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

## Next, in order

**1. Auth and onboarding.** Sign up, sign in, create an organization, invite
the first people. Nothing else can be demonstrated until a league can exist.

**2. Stripe Connect.** Onboard a connected account, take a registration
payment to it, handle the webhook, show the league their money. This is the
gate on a league actually running a season here, and it is the largest piece
of genuinely new work.

**3. Registration.** Build the form from the question bank, apply tiers,
sibling discounts and promo codes, confirm, land on a roster.

**4. The season.** Schedule generation, rosters, the draft screens, game
list, score entry, standings.

**5. Live tracking.** Wire the baseball engine to the scorekeeper screen and
the public follow view. Most of the logic is already here and tested; what is
missing is the screens and the polling route.

**6. The league PWA.** Per-league manifest and icons, install prompt, push
notifications for schedule changes and game results.

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
