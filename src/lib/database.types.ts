// Generated types for the Supabase schema.
//
// Unlike the project this code came from, this file is NOT hand-maintained.
// There, every new table and column needed a matching manual edit, and
// anything missed silently typed as `never` -- a slow, quiet source of bugs.
// Here it is regenerated from the live schema:
//
//     npm run types:gen
//
// What follows is a minimal stand-in so the project typechecks before the
// migrations in supabase/migrations/ have been applied to a project. Replace
// it wholesale with the generated output; do not edit it by hand.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type OrgRoleValue = 'member' | 'coach' | 'league_manager' | 'admin' | 'owner';

export interface Database {
  public: {
    Tables: {
      memberships: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: 'member' | 'coach' | 'league_manager' | 'admin' | 'owner';
          invited_by: string | null;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: 'member' | 'coach' | 'league_manager' | 'admin' | 'owner';
          invited_by?: string | null;
          accepted_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          slug: string;
          name: string;
          timezone: string;
          logo_url: string | null;
          brand_primary: string | null;
          brand_accent: string | null;
          stripe_account_id: string | null;
          stripe_customer_id: string | null;
          subscription_status: string;
          trial_ends_at: string;
          created_at: string;
          archived_at: string | null;
        };
        Insert: {
          slug: string;
          name: string;
          timezone?: string;
          logo_url?: string | null;
          brand_primary?: string | null;
          brand_accent?: string | null;
        };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
        Relationships: [];
      };
      organization_billing: {
        Row: {
          organization_id: string;
          stripe_account_id: string | null;
          stripe_customer_id: string | null;
          charges_enabled: boolean;
          plan: 'league' | 'unlimited';
          subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled';
          trial_ends_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          stripe_account_id?: string | null;
          stripe_customer_id?: string | null;
          charges_enabled?: boolean;
          plan?: 'league' | 'unlimited';
        };
        Update: Partial<Database['public']['Tables']['organization_billing']['Insert']>;
        Relationships: [];
      };
      sports: {
        Row: {
          key: string;
          label: string;
          scoring_engine: string | null;
          period_noun: string;
          period_count: number | null;
          sort_order: number;
          is_active: boolean;
        };
        Insert: { key: string; label: string };
        Update: Partial<Database['public']['Tables']['sports']['Insert']>;
        Relationships: [];
      };
      programs: {
        Row: {
          id: string;
          organization_id: string;
          kind: 'league' | 'camp' | 'clinic' | 'class' | 'club' | 'event';
          sport_key: string | null;
          parent_program_id: string | null;
          title: string;
          slug: string;
          description: string | null;
          short_description: string | null;
          category: string | null;
          age_min: number | null;
          age_max: number | null;
          capacity: number | null;
          is_free: boolean;
          status: 'draft' | 'published' | 'registration_closed' | 'archived' | 'cancelled';
          registration_opens_at: string | null;
          registration_closes_at: string | null;
          starts_on: string | null;
          ends_on: string | null;
          involves_minors: boolean;
          fee_policy: 'league_absorbs' | 'family_pays';
          sibling_discount_enabled: boolean;
          sibling_discount_type: 'percent' | 'flat' | null;
          sibling_discount_rate: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          kind: 'league' | 'camp' | 'clinic' | 'class' | 'club' | 'event';
          title: string;
          slug: string;
          sport_key?: string | null;
          status?: 'draft' | 'published' | 'registration_closed' | 'archived' | 'cancelled';
          starts_on?: string | null;
          ends_on?: string | null;
          involves_minors?: boolean;
          created_by?: string | null;
          capacity?: number | null;
          fee_policy?: 'league_absorbs' | 'family_pays';
          sibling_discount_enabled?: boolean;
          sibling_discount_type?: 'percent' | 'flat' | null;
          sibling_discount_rate?: number | null;
          registration_opens_at?: string | null;
          registration_closes_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['programs']['Insert']>;
        Relationships: [];
      };
      program_sessions: {
        Row: {
          id: string;
          program_id: string;
          organization_id: string;
          session_type: 'game' | 'practice' | 'meeting';
          home_team_id: string | null;
          away_team_id: string | null;
          location_name: string | null;
          location_address: string | null;
          start_at: string;
          end_at: string | null;
          status: 'scheduled' | 'in_progress' | 'final' | 'cancelled' | 'postponed';
          home_score: number | null;
          away_score: number | null;
          round_label: string | null;
          bracket_slot: string | null;
          stream_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          program_id: string;
          organization_id: string;
          session_type?: 'game' | 'practice' | 'meeting';
          home_team_id?: string | null;
          away_team_id?: string | null;
          location_name?: string | null;
          start_at: string;
          end_at?: string | null;
          status?: 'scheduled' | 'in_progress' | 'final' | 'cancelled' | 'postponed';
          home_score?: number | null;
          away_score?: number | null;
          stream_url?: string | null;
        };
        Update: Partial<Database['public']['Tables']['program_sessions']['Insert']>;
        Relationships: [];
      };
      pricing_tiers: {
        Row: {
          id: string;
          program_id: string;
          organization_id: string;
          label: string;
          tier_type: string;
          amount_cents: number;
          available_from: string | null;
          available_until: string | null;
          capacity: number | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          program_id: string;
          organization_id: string;
          label: string;
          tier_type: string;
          amount_cents: number;
          available_from?: string | null;
          available_until?: string | null;
          capacity?: number | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['pricing_tiers']['Insert']>;
        Relationships: [];
      };
      promo_codes: {
        Row: {
          id: string;
          organization_id: string;
          code: string;
          program_id: string | null;
          discount_type: 'percent' | 'flat';
          discount_value: number;
          max_redemptions: number | null;
          redeemed_count: number;
          starts_at: string | null;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          code: string;
          program_id?: string | null;
          discount_type: 'percent' | 'flat';
          discount_value: number;
          max_redemptions?: number | null;
          starts_at?: string | null;
          expires_at?: string | null;
          is_active?: boolean;
        };
        Update: Partial<Database['public']['Tables']['promo_codes']['Insert']>;
        Relationships: [];
      };
      question_bank: {
        Row: {
          id: string;
          organization_id: string;
          label: string;
          field_type: 'short_text' | 'long_text' | 'select' | 'multi_select' | 'checkbox' | 'date';
          options: Json;
          help_text: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          label: string;
          field_type: 'short_text' | 'long_text' | 'select' | 'multi_select' | 'checkbox' | 'date';
          options?: Json;
          help_text?: string | null;
        };
        Update: Partial<Database['public']['Tables']['question_bank']['Insert']>;
        Relationships: [];
      };
      program_questions: {
        Row: {
          id: string;
          program_id: string;
          question_id: string;
          organization_id: string;
          is_required: boolean;
          sort_order: number;
        };
        Insert: {
          program_id: string;
          question_id: string;
          organization_id: string;
          is_required?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['program_questions']['Insert']>;
        Relationships: [];
      };
      households: {
        Row: {
          id: string;
          organization_id: string;
          primary_contact_id: string;
          created_at: string;
        };
        Insert: { organization_id: string; primary_contact_id: string };
        Update: Partial<Database['public']['Tables']['households']['Insert']>;
        Relationships: [];
      };
      dependents: {
        Row: {
          id: string;
          household_id: string;
          organization_id: string;
          first_name: string;
          last_name: string;
          date_of_birth: string | null;
          created_at: string;
        };
        Insert: {
          household_id: string;
          organization_id: string;
          first_name: string;
          last_name: string;
          date_of_birth?: string | null;
        };
        Update: Partial<Database['public']['Tables']['dependents']['Insert']>;
        Relationships: [];
      };
      registrations: {
        Row: {
          id: string;
          organization_id: string;
          program_id: string;
          dependent_id: string | null;
          registrant_id: string | null;
          status: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | 'refunded';
          pricing_tier_id: string | null;
          promo_code_id: string | null;
          amount_due_cents: number;
          amount_paid_cents: number;
          stripe_payment_intent_id: string | null;
          stripe_checkout_session_id: string | null;
          answers: Json;
          fee_policy: 'league_absorbs' | 'family_pays';
          quote_lines: Json;
          net_cents: number | null;
          child_number: number;
          team_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          program_id: string;
          dependent_id?: string | null;
          registrant_id?: string | null;
          status?: 'pending' | 'confirmed' | 'waitlisted' | 'cancelled' | 'refunded';
          pricing_tier_id?: string | null;
          promo_code_id?: string | null;
          amount_due_cents?: number;
          amount_paid_cents?: number;
          stripe_payment_intent_id?: string | null;
          stripe_checkout_session_id?: string | null;
          answers?: Json;
          fee_policy?: 'league_absorbs' | 'family_pays';
          quote_lines?: Json;
          net_cents?: number | null;
          child_number?: number;
          team_id?: string | null;
        };
        Update: Partial<Database['public']['Tables']['registrations']['Insert']>;
        Relationships: [];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: OrgRoleValue;
          token: string;
          team_id: string | null;
          invited_by: string | null;
          created_at: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          revoked_at: string | null;
        };
        Insert: {
          organization_id: string;
          email: string;
          role?: OrgRoleValue;
          team_id?: string | null;
          invited_by?: string | null;
          expires_at?: string;
        };
        Update: Partial<Database['public']['Tables']['invitations']['Insert']> & {
          revoked_at?: string | null;
        };
        Relationships: [];
      };
      coach_applications: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          program_id: string | null;
          experience: string | null;
          phone: string | null;
          status: 'applied' | 'approved' | 'declined' | 'withdrawn';
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          program_id?: string | null;
          experience?: string | null;
          phone?: string | null;
          status?: 'applied' | 'approved' | 'declined' | 'withdrawn';
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
        };
        Update: Partial<Database['public']['Tables']['coach_applications']['Insert']>;
        Relationships: [];
      };
      coach_requirements: {
        Row: {
          id: string;
          organization_id: string;
          label: string;
          description: string | null;
          renews_after_months: number | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          label: string;
          description?: string | null;
          renews_after_months?: number | null;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database['public']['Tables']['coach_requirements']['Insert']>;
        Relationships: [];
      };
      coach_requirement_completions: {
        Row: {
          id: string;
          requirement_id: string;
          organization_id: string;
          user_id: string;
          completed_on: string;
          confirmed_by: string | null;
          note: string | null;
          created_at: string;
        };
        Insert: {
          requirement_id: string;
          organization_id: string;
          user_id: string;
          completed_on?: string;
          confirmed_by?: string | null;
          note?: string | null;
        };
        Update: Partial<Database['public']['Tables']['coach_requirement_completions']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: { id: string; full_name?: string | null; email?: string | null };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      teams: {
        Row: {
          id: string;
          league_id: string;
          organization_id: string;
          name: string;
          color: string | null;
          created_at: string;
        };
        Insert: {
          league_id: string;
          organization_id: string;
          name: string;
          color?: string | null;
        };
        Update: Partial<Database['public']['Tables']['teams']['Insert']>;
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          organization_id: string;
          registration_id: string | null;
          user_id: string | null;
          display_name: string | null;
          jersey_number: string | null;
          drafted_at: string;
          drafted_by: string | null;
        };
        Insert: {
          team_id: string;
          organization_id: string;
          registration_id?: string | null;
          user_id?: string | null;
          display_name?: string | null;
          jersey_number?: string | null;
          drafted_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['team_members']['Insert']>;
        Relationships: [];
      };
      leagues: {
        Row: {
          id: string;
          organization_id: string;
          bracket_format: string;
          schedule_published_at: string | null;
          rosters_published_at: string | null;
          standings_published_at: string | null;
          live_tracking_enabled: boolean;
          roster_model: 'draft' | 'assigned' | 'team_registration';
        };
        Insert: {
          id: string;
          organization_id: string;
          bracket_format?: string;
          roster_model?: 'draft' | 'assigned' | 'team_registration';
        };
        Update: Partial<Database['public']['Tables']['leagues']['Insert']>;
        Relationships: [];
      };
      team_coaches: {
        Row: {
          id: string;
          team_id: string;
          organization_id: string;
          user_id: string;
          role: 'head' | 'assistant' | 'captain';
          created_at: string;
        };
        Insert: {
          team_id: string;
          organization_id: string;
          user_id: string;
          role?: 'head' | 'assistant' | 'captain';
        };
        Update: Partial<Database['public']['Tables']['team_coaches']['Insert']>;
        Relationships: [];
      };
      game_scorekeepers: {
        Row: {
          id: string;
          session_id: string;
          team_id: string;
          organization_id: string;
          user_id: string;
          granted_by: string | null;
          created_at: string;
        };
        Insert: {
          session_id: string;
          team_id: string;
          organization_id: string;
          user_id: string;
          granted_by?: string | null;
        };
        Update: Partial<Database['public']['Tables']['game_scorekeepers']['Insert']>;
        Relationships: [];
      };
      announcements: {
        Row: {
          id: string;
          organization_id: string;
          scope: 'organization' | 'program' | 'teams';
          program_id: string | null;
          subject: string;
          body: string;
          recipient_count: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          scope: 'organization' | 'program' | 'teams';
          program_id?: string | null;
          subject: string;
          body: string;
        };
        Update: Partial<Database['public']['Tables']['announcements']['Insert']>;
        Relationships: [];
      };
      announcement_teams: {
        Row: { announcement_id: string; team_id: string };
        Insert: { announcement_id: string; team_id: string };
        Update: Partial<Database['public']['Tables']['announcement_teams']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      registration_ledger: {
        Row: {
          id: string;
          organization_id: string;
          program_id: string;
          status: string;
          created_at: string;
          amount_due_cents: number;
          amount_paid_cents: number;
          net_cents: number | null;
          fee_policy: string;
          child_number: number;
          dependent_id: string | null;
          registrant_id: string | null;
          player_name: string | null;
          tier_label: string | null;
          promo_code: string | null;
        };
        Relationships: [];
      };
      coach_roster: {
        Row: {
          organization_id: string;
          user_id: string;
          application_status: 'applied' | 'approved' | 'declined' | 'withdrawn';
          applied_at: string;
          experience: string | null;
          phone: string | null;
          cleared: boolean;
          missing_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      create_organization: {
        Args: { org_name: string; org_slug: string; org_timezone?: string };
        Returns: string;
      };
      accept_invitation: {
        Args: { invite_token: string };
        Returns: string;
      };
      is_coach_cleared: {
        Args: { org: string; coach: string };
        Returns: boolean;
      };
      missing_coach_requirements: {
        Args: { org: string; coach: string };
        Returns: Database['public']['Tables']['coach_requirements']['Row'][];
      };
      claim_registration_spot: {
        Args: {
          p_program_id: string;
          p_dependent_id: string | null;
          p_registrant_id: string | null;
          p_pricing_tier_id: string | null;
          p_promo_code_id: string | null;
          p_amount_due_cents: number;
          p_net_cents: number;
          p_fee_policy: string;
          p_child_number: number;
          p_quote_lines: Json;
          p_answers: Json;
        };
        Returns: { result: 'claimed' | 'full' | 'closed' | 'duplicate'; registration_id: string | null }[];
      };
      lookup_promo_code: {
        Args: { p_program_id: string; p_code: string };
        Returns: {
          id: string;
          code: string;
          discount_type: string;
          discount_value: number;
          is_active: boolean;
          starts_at: string | null;
          expires_at: string | null;
          max_redemptions: number | null;
          redeemed_count: number;
          program_id: string | null;
        }[];
      };
      release_stale_registrations: {
        Args: Record<string, never>;
        Returns: number;
      };
      count_promo_redemption: {
        Args: { p_promo_code_id: string };
        Returns: undefined;
      };
      org_plan_of: {
        Args: { org: string };
        Returns: 'league' | 'unlimited';
      };
      active_season_count: {
        Args: { org: string };
        Returns: number;
      };
      announcement_audience: {
        Args: {
          p_organization_id: string;
          p_scope: string;
          p_program_id: string | null;
          p_team_ids: string[];
        };
        Returns: string[];
      };
      send_announcement: {
        Args: {
          p_organization_id: string;
          p_scope: string;
          p_program_id: string | null;
          p_team_ids: string[];
          p_subject: string;
          p_body: string;
        };
        Returns: { announcement_id: string; recipients: number }[];
      };
    };
    Enums: {
      org_role: 'member' | 'coach' | 'league_manager' | 'admin' | 'owner';
    };
    CompositeTypes: Record<string, never>;
  };
}
