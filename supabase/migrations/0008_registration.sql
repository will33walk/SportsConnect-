-- 0008_registration.sql
--
-- Taking money, without the two bugs that make league software infuriating.
--
-- BUG ONE: overselling. Two parents hit Register at 8:00:01 on the night
-- registration opens for a 60-player division with 61 spots left between
-- them. Any check that reads the count, decides, and then inserts has a race
-- in the gap. The fix is a single statement that counts and inserts under one
-- row lock, which is what claim_registration_spot() below does.
--
-- BUG TWO: paying twice, or paying and not being registered. A parent closes
-- the tab mid-checkout; their card is charged and nobody knows. Or they press
-- back and pay again. Handled by making the registration row exist BEFORE
-- checkout in 'pending', carrying the Stripe session on it, and letting the
-- webhook be the only thing that promotes it to 'confirmed'.
--
-- The pricing posture this encodes -- a flat monthly price to the league and
-- no cut of registration money -- is the product's whole reason to exist, so
-- the one thing this schema must never grow is a platform fee column.

-- ---------------------------------------------------------------------------
-- Who pays the card fee
-- ---------------------------------------------------------------------------

-- Per program, because a league often absorbs it for a youth division and
-- passes it on for adult rec. Default to absorbing: the sticker price is then
-- the price, which is the kinder default and the one that doesn't surprise a
-- parent at the last screen.
alter table programs
  add column fee_policy text not null default 'league_absorbs'
    check (fee_policy in ('league_absorbs', 'family_pays'));

comment on column programs.fee_policy is
  'Who covers card processing. Never a platform fee -- we do not take one.';

-- Registration opens and closes per program already. This is the other half:
-- a hard cap on confirmed registrations, enforced atomically below.
comment on column programs.capacity is
  'Max confirmed registrations. Null means unlimited. Enforced by claim_registration_spot().';

-- ---------------------------------------------------------------------------
-- What a registration remembers about its own price
--
-- Stored, not recomputed. A tier's price can change mid-season and a promo
-- code can expire, but what this family was charged in April is a fact about
-- April. Recomputing a historical total from current settings is how a
-- treasurer ends up unable to reconcile a bank statement.
-- ---------------------------------------------------------------------------

alter table registrations
  add column fee_policy text not null default 'league_absorbs'
    check (fee_policy in ('league_absorbs', 'family_pays')),
  -- The breakdown exactly as the parent saw it, from buildQuote(). Kept as
  -- jsonb rather than normalised: it is a receipt, never queried across.
  add column quote_lines jsonb not null default '[]'::jsonb,
  -- What the league receives after the card fee. Written when payment
  -- confirms, so a league's revenue report doesn't have to re-derive it.
  add column net_cents integer,
  -- Which child of this household this was, for the sibling discount. Stored
  -- so a refund or an audit can see why the price differed.
  add column child_number integer not null default 1 check (child_number >= 1);

-- ---------------------------------------------------------------------------
-- Claiming a spot
--
-- One statement, one lock, no race. Takes the program row's lock first so
-- concurrent callers serialise on it, counts confirmed-or-pending
-- registrations inside that lock, and either inserts or reports why not.
--
-- Pending counts toward capacity on purpose: a parent partway through
-- checkout has the spot. Abandoned pendings are released by
-- release_stale_registrations() below rather than by letting someone else
-- take a spot out from under an in-flight payment.
-- ---------------------------------------------------------------------------

create type spot_result as enum ('claimed', 'full', 'closed', 'duplicate');

create function public.claim_registration_spot(
  p_program_id uuid,
  p_dependent_id uuid,
  p_registrant_id uuid,
  p_pricing_tier_id uuid,
  p_promo_code_id uuid,
  p_amount_due_cents integer,
  p_net_cents integer,
  p_fee_policy text,
  p_child_number integer,
  p_quote_lines jsonb,
  p_answers jsonb
)
returns table (result spot_result, registration_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  prog programs;
  taken integer;
  existing uuid;
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to register.';
  end if;

  -- This function is security definer, so it runs past RLS -- which means it
  -- has to do the authorization RLS would otherwise have done. Without this
  -- check, a caller could pass any dependent id and register someone else's
  -- child, which would charge them for a stranger and put a registration the
  -- real family never made onto their own account page.
  if p_dependent_id is not null then
    if not exists (
      select 1
      from dependents d
      join households h on h.id = d.household_id
      where d.id = p_dependent_id
        and (
          h.primary_contact_id = auth.uid()
          or exists (
            select 1 from household_links hl
            where hl.household_id = h.id and hl.user_id = auth.uid()
          )
        )
    ) then
      raise exception 'That player isn''t on your account.';
    end if;
  end if;

  -- Registering yourself is the only other option. A caller cannot name a
  -- different adult as the registrant.
  if p_dependent_id is null and p_registrant_id is distinct from auth.uid() then
    raise exception 'You can only register yourself.';
  end if;

  -- The lock. Everything below runs with this program row held, so two
  -- simultaneous registrations cannot both see the same spot as free.
  select * into prog from programs where id = p_program_id for update;

  if not found then
    raise exception 'That program doesn''t exist.';
  end if;

  if prog.status <> 'published' then
    return query select 'closed'::spot_result, null::uuid;
    return;
  end if;
  if prog.registration_opens_at is not null and prog.registration_opens_at > now() then
    return query select 'closed'::spot_result, null::uuid;
    return;
  end if;
  if prog.registration_closes_at is not null and prog.registration_closes_at < now() then
    return query select 'closed'::spot_result, null::uuid;
    return;
  end if;

  -- Already registered? Return the existing row rather than making a second
  -- one. A parent who double-taps Register should land on their receipt.
  if p_dependent_id is not null then
    select id into existing from registrations
    where program_id = p_program_id
      and dependent_id = p_dependent_id
      and status in ('pending', 'confirmed', 'waitlisted');
  else
    select id into existing from registrations
    where program_id = p_program_id
      and registrant_id = p_registrant_id
      and dependent_id is null
      and status in ('pending', 'confirmed', 'waitlisted');
  end if;

  if existing is not null then
    return query select 'duplicate'::spot_result, existing;
    return;
  end if;

  if prog.capacity is not null then
    select count(*) into taken from registrations
    where program_id = p_program_id and status in ('pending', 'confirmed');

    if taken >= prog.capacity then
      -- Full, so this becomes a waitlist row rather than a refusal. A league
      -- would rather have the name than lose the family.
      insert into registrations (
        organization_id, program_id, dependent_id, registrant_id, status,
        pricing_tier_id, promo_code_id, amount_due_cents, net_cents,
        fee_policy, child_number, quote_lines, answers
      ) values (
        prog.organization_id, p_program_id, p_dependent_id, p_registrant_id, 'waitlisted',
        p_pricing_tier_id, p_promo_code_id, p_amount_due_cents, p_net_cents,
        p_fee_policy, p_child_number, p_quote_lines, p_answers
      ) returning id into new_id;

      return query select 'full'::spot_result, new_id;
      return;
    end if;
  end if;

  insert into registrations (
    organization_id, program_id, dependent_id, registrant_id, status,
    pricing_tier_id, promo_code_id, amount_due_cents, net_cents,
    fee_policy, child_number, quote_lines, answers
  ) values (
    prog.organization_id, p_program_id, p_dependent_id, p_registrant_id, 'pending',
    p_pricing_tier_id, p_promo_code_id, p_amount_due_cents, p_net_cents,
    p_fee_policy, p_child_number, p_quote_lines, p_answers
  ) returning id into new_id;

  return query select 'claimed'::spot_result, new_id;
end;
$$;

revoke all on function public.claim_registration_spot(
  uuid, uuid, uuid, uuid, uuid, integer, integer, text, integer, jsonb, jsonb
) from public;
grant execute on function public.claim_registration_spot(
  uuid, uuid, uuid, uuid, uuid, integer, integer, text, integer, jsonb, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- Releasing abandoned checkouts
--
-- A pending registration holds a spot. Someone who opened checkout and walked
-- away should not hold it forever, but the window has to be long enough that
-- a parent hunting for their wallet doesn't lose their place. Thirty minutes.
--
-- Called by a scheduled job. Deliberately not a trigger: time passing is not
-- a database event.
-- ---------------------------------------------------------------------------

create function public.release_stale_registrations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  released integer;
begin
  with stale as (
    update registrations
       set status = 'cancelled'
     where status = 'pending'
       and amount_due_cents > 0
       and created_at < now() - interval '30 minutes'
    returning id
  )
  select count(*) into released from stale;

  return released;
end;
$$;

-- ---------------------------------------------------------------------------
-- Promo redemption counting
--
-- Counted when a registration confirms, not when a code is typed -- otherwise
-- an abandoned checkout burns a redemption. The webhook is the only caller,
-- through the service role.
-- ---------------------------------------------------------------------------

create function public.count_promo_redemption(p_promo_code_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update promo_codes
     set redeemed_count = redeemed_count + 1
   where id = p_promo_code_id;
$$;

-- ---------------------------------------------------------------------------
-- Reading a promo code without being able to list them
--
-- promo_codes has no member-readable policy by design: a parent should not be
-- able to enumerate every discount a league offers. But they do need to find
-- out whether the code on their flyer works. This takes a code and returns
-- only that one, or nothing.
-- ---------------------------------------------------------------------------

create function public.lookup_promo_code(p_program_id uuid, p_code text)
returns table (
  id uuid,
  code text,
  discount_type text,
  discount_value numeric,
  is_active boolean,
  starts_at timestamptz,
  expires_at timestamptz,
  max_redemptions integer,
  redeemed_count integer,
  program_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.code, p.discount_type, p.discount_value, p.is_active,
         p.starts_at, p.expires_at, p.max_redemptions, p.redeemed_count, p.program_id
  from promo_codes p
  join programs prog on prog.id = p_program_id
  where p.organization_id = prog.organization_id
    and lower(p.code) = lower(trim(p_code))
    -- Only for this program or org-wide. A code for a different division
    -- comes back empty rather than as "wrong program", so a parent can't map
    -- out what else exists.
    and (p.program_id is null or p.program_id = p_program_id)
  limit 1;
$$;

revoke all on function public.lookup_promo_code(uuid, text) from public;
grant execute on function public.lookup_promo_code(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What a family may see of their own registrations
--
-- 0002 gave registrations a read policy covering the registrant and the
-- household. That still holds. What's added here is the ability to see the
-- pricing tiers and questions for a published program without being a member
-- yet -- a parent registering for the first time has no membership, and
-- requiring one before they can see a price is the kind of wall this product
-- exists to remove.
-- ---------------------------------------------------------------------------

create policy "pricing for published programs is public"
  on pricing_tiers for select
  to anon, authenticated
  using (
    is_active
    and exists (select 1 from programs p where p.id = program_id and p.status = 'published')
  );

create policy "questions for published programs are public"
  on program_questions for select
  to anon, authenticated
  using (
    exists (select 1 from programs p where p.id = program_id and p.status = 'published')
  );

create policy "question text for published programs is public"
  on question_bank for select
  to anon, authenticated
  using (
    exists (
      select 1 from program_questions pq
      join programs p on p.id = pq.program_id
      where pq.question_id = question_bank.id and p.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- A league's own view of its money
--
-- One row per registration with the numbers a treasurer needs, so the
-- registrations screen isn't re-deriving totals in the application.
-- security_invoker so it respects the caller's own policies.
-- ---------------------------------------------------------------------------

create view registration_ledger
  with (security_invoker = true) as
select
  r.id,
  r.organization_id,
  r.program_id,
  r.status,
  r.created_at,
  r.amount_due_cents,
  r.amount_paid_cents,
  r.net_cents,
  r.fee_policy,
  r.child_number,
  r.dependent_id,
  r.registrant_id,
  coalesce(d.first_name || ' ' || d.last_name, pr.full_name, pr.email) as player_name,
  pt.label as tier_label,
  pc.code as promo_code
from registrations r
left join dependents d on d.id = r.dependent_id
left join profiles pr on pr.id = r.registrant_id
left join pricing_tiers pt on pt.id = r.pricing_tier_id
left join promo_codes pc on pc.id = r.promo_code_id;
