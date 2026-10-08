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
          subscription_status: 'trialing' | 'active' | 'past_due' | 'canceled';
          trial_ends_at: string;
          updated_at: string;
        };
        Insert: {
          organization_id: string;
          stripe_account_id?: string | null;
          stripe_customer_id?: string | null;
          charges_enabled?: boolean;
        };
        Update: Partial<Database['public']['Tables']['organization_billing']['Insert']>;
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
    };
    Views: {
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
    };
    Enums: {
      org_role: 'member' | 'coach' | 'league_manager' | 'admin' | 'owner';
    };
    CompositeTypes: Record<string, never>;
  };
}
