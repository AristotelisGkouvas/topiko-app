/** Mirrors app/schemas on the backend. Kept hand-written rather than generated
 *  from OpenAPI while the shape is still moving — one file to update, and the
 *  compiler catches the drift the moment a field is renamed. */

export type MatchStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled"
  | "awarded";

export type DataSource = "scraper" | "manual_live" | "manual_confirmed";

export type LeagueKind = "championship" | "cup" | "playoff";

export type FieldSurface = "grass" | "artificial" | "dirt";

export type StandingZone =
  | "promotion"
  | "promotion_playoff"
  | "relegation_playoff"
  | "relegation";

export interface Association {
  id: number;
  slug: string;
  name: string;
  short_name: string | null;
  region: string | null;
  source_url: string | null;
  logo_url: string | null;
  primary_color: string | null;
}

export interface Season {
  id: number;
  slug: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
}

export interface FieldRef {
  id: number;
  slug: string;
  name: string;
  short_name: string | null;
  city: string | null;
}

export interface Field extends FieldRef {
  address: string | null;
  postal_code: string | null;
  latitude: string | null;
  longitude: string | null;
  surface: FieldSurface | null;
  capacity: number | null;
  has_floodlights: boolean | null;
  notes: string | null;
}

export interface TeamRef {
  id: number;
  slug: string;
  name: string;
  short_name: string | null;
  initials: string | null;
  logo_url: string | null;
}

export interface Team extends TeamRef {
  founded_year: number | null;
  city: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  home_field: FieldRef | null;
}

export interface League {
  id: number;
  slug: string;
  name: string;
  short_name: string | null;
  kind: LeagueKind;
  tier: number | null;
  group_name: string | null;
  total_matchdays: number | null;
  current_matchday: number | null;
  zones: Partial<Record<StandingZone, number[]>>;
  season: Season;
}

export interface Match {
  id: number;
  league_id: number;
  matchday: number | null;
  kickoff_at: string | null;
  status: MatchStatus;
  is_live: boolean;
  minute: number | null;
  home_team: TeamRef;
  away_team: TeamRef;
  home_score: number | null;
  away_score: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  field: FieldRef | null;
  referee: string | null;
  note: string | null;
  data_source: DataSource;
  updated_at: string;
}

export interface Standing {
  team: TeamRef;
  position: number;
  previous_position: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form: string | null;
  zone: StandingZone | null;
}

export interface Meta {
  association: string;
  source_url: string | null;
  last_scraped_at: string | null;
  live_matches: number;
}
