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
        Insert: { slug: string; name: string; timezone?: string };
        Update: Partial<Database['public']['Tables']['organizations']['Insert']>;
        Relationships: [];
      };
      team_coaches: {
        Row: {
          id: string;
          team_id: string;
          organization_id: string;
          user_id: string;
          role: 'head' | 'assistant';
          created_at: string;
        };
        Insert: {
          team_id: string;
          organization_id: string;
          user_id: string;
          role?: 'head' | 'assistant';
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
    Views: Record<string, never>;
    Functions: {
      create_organization: {
        Args: { org_name: string; org_slug: string; org_timezone?: string };
        Returns: string;
      };
    };
    Enums: {
      org_role: 'member' | 'coach' | 'league_manager' | 'admin' | 'owner';
    };
    CompositeTypes: Record<string, never>;
  };
}
