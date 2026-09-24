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
  surface: FieldSurface | null;
  capacity: number | null;
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

export interface TeamDetail extends Team {
  /** Season slugs the club actually played in, newest first. */
  seasons: string[];
}

export interface League {
  id: number;
  slug: string;
  name: string;
  short_name: string | null;
  kind: LeagueKind;
  tier: number | null;
  /** "Κ10", "Παίδων", … null for the open-age divisions. */
  age_group: string | null;
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

export interface PlayerRef {
  id: number;
  slug: string;
  name: string;
  birth_year: number | null;
}

/** One row of the σκόρερ table.
 *
 *  Every count is nullable because the federation does not publish the same
 *  columns for every competition. A zero would claim the player has no cards;
 *  null says the column was not published, and only the second may be rendered
 *  as a dash.
 */
export interface Scorer {
  player: PlayerRef;
  team: TeamRef | null;
  goals: number | null;
  own_goals: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  minutes: number | null;
}

export interface MatchDetail {
  match: Match;
  league: League;
  /** Earlier meetings of the same two clubs, newest first. Home and away are
   *  as they were played, not as in the fixture being viewed. */
  head_to_head: Match[];
  home_standing: Standing | null;
  away_standing: Standing | null;
}

/** A search hit. Carries a club and a goal count because the name alone does
 *  not identify anybody — the register holds three ΘΑΝΑΣΗΣ ΚΩΝΣΤΑΝΤΙΝΟΣ. */
export interface PlayerSearchResult extends PlayerRef {
  last_team: TeamRef | null;
  total_goals: number;
}

export interface PlayerSeason {
  season: Season;
  league_slug: string;
  league_name: string;
  team: TeamRef | null;
  goals: number | null;
  own_goals: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
}

export interface PlayerDetail extends PlayerRef {
  /** Newest first. */
  seasons: PlayerSeason[];
  /** Summed over published leaderboard lines, so a floor rather than a count:
   *  a season the federation published no list for contributes nothing. */
  total_goals: number;
  seasons_scored: number;
  clubs: TeamRef[];
}

export interface HeadToHead {
  home: TeamRef;
  away: TeamRef;
  /** Wins for `home`, wherever the match was played. */
  home_wins: number;
  away_wins: number;
  draws: number;
  home_goals: number;
  away_goals: number;
  played: number;
  first_meeting: string | null;
  last_meeting: string | null;
  matches: Match[];
}

export interface OnThisDay {
  day: number;
  month: number;
  matches: Match[];
}

export interface RecordMatch {
  match: Match;
  value: number;
}

export interface TopScorerAllTime {
  player_id: number;
  player_slug: string;
  player_name: string;
  goals: number;
  seasons: number;
}

export interface Records {
  biggest_wins: RecordMatch[];
  highest_scoring: RecordMatch[];
  top_scorers: TopScorerAllTime[];
  total_matches: number;
  total_goals: number;
  seasons_covered: number;
}

export interface Suspension {
  id: number;
  player: PlayerRef;
  /** Absent when the player never appeared in a published leaderboard: the
   *  source names a fixture, never a club, so the club has to be inferred. */
  team: TeamRef | null;
  league_slug: string;
  league_name: string;
  matchday: number | null;
  decided_on: string | null;
  /** How many matches the ban runs for. */
  matches: number;
  fixture: string | null;
  match_id: number | null;
}

export interface LiveStanding extends Standing {
  /** Where the official table has this club, so movement can be drawn without
   *  comparing against a previous poll — which would show a club moving every
   *  time somebody else scored. */
  actual_position: number | null;
}

export interface LiveTable {
  rows: LiveStanding[];
  /** Zero means the projection equals the real table. */
  live_matches: number;
}

export interface ComparedSide {
  team: TeamRef;
  /** The two clubs need not be in the same division, so the table each
   *  position belongs to travels with it. */
  league_slug: string | null;
  league_name: string | null;
  position: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form: string | null;
}

export interface Comparison {
  season: string;
  left: ComparedSide;
  right: ComparedSide;
  record: HeadToHead | null;
}

export interface Announcement {
  id: number;
  title: string;
  published_at: string | null;
  body: string | null;
  image_url: string | null;
}

/** All a crest needs. A search hit has no id and should not have to
 *  invent one to be badged. */
export interface CrestSubject {
  name: string;
  initials?: string | null;
}

/** A ground's own page: everything `Field` has, plus who plays there. */
export interface FieldDetail extends Field {
  home_teams: TeamRef[];
}

/** One row in the search results.
 *
 *  The same shape whatever was found, because the "Όλα" tab shows all three
 *  kinds in one list and a row that branches on its payload renders three ways.
 *  `kind` is only used to pick the destination and the little glyph.
 */
export interface SearchHit {
  kind: "team" | "player" | "field";
  slug: string;
  name: string;
  subtitle: string | null;
  logo_url: string | null;
}

export interface SearchResults {
  query: string;
  teams: SearchHit[];
  players: SearchHit[];
  fields: SearchHit[];
}
