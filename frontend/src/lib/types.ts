/** The API's shapes, generated from its OpenAPI document into
 *  `api-schema.ts` (`npm run types`) and named here the way the app uses them.
 *  CI regenerates the schema and fails on any difference, so a field renamed on
 *  the backend is a compile error here rather than an `undefined` on a page. */

import type { components } from "./api-schema";

type S = components["schemas"];

export type MatchStatus = S["MatchStatus"];

export type DataSource = S["DataSource"];

export type LeagueKind = S["LeagueKind"];

export type FieldSurface = S["FieldSurface"];

export type StandingZone = S["StandingZone"];

export type Association = S["AssociationOut"];

export type Season = S["SeasonOut"];

export type FieldRef = S["FieldRef"];

export type Field = S["FieldOut"];

export type TeamRef = S["TeamRef"];

export type Team = S["TeamOut"];

export type TeamDetail = S["TeamDetailOut"];

export type League = S["LeagueOut"];

export type Match = S["MatchOut"];

export type Standing = S["StandingOut"];

export type Meta = S["Meta"];

/** Where one club stands, and in which division. */
export type TeamStanding = S["TeamStandingOut"];

export type PlayerRef = S["PlayerRef"];

/** One row of the σκόρερ table.
 *
 *  Every count is nullable because the federation does not publish the same
 *  columns for every competition. A zero would claim the player has no cards;
 *  null says the column was not published, and only the second may be rendered
 *  as a dash.
 */
export type Scorer = S["ScorerOut"];

export type MatchDetail = S["MatchDetailOut"];

/** A search hit. Carries a club and a goal count because the name alone does
 *  not identify anybody — the register holds three ΘΑΝΑΣΗΣ ΚΩΝΣΤΑΝΤΙΝΟΣ. */
export type PlayerSearchResult = S["PlayerSearchOut"];

export type PlayerSeason = S["PlayerSeasonOut"];

export type PlayerDetail = S["PlayerDetailOut"];

export type HeadToHead = S["HeadToHeadOut"];

export type OnThisDay = S["OnThisDayOut"];

export type RecordMatch = S["RecordMatchOut"];

export type TopScorerAllTime = S["TopScorerAllTimeOut"];

export type Records = S["RecordsOut"];

export type Suspension = S["SuspensionOut"];

export type LiveStanding = S["LiveStandingOut"];

export type LiveTable = S["LiveTableOut"];

export type ComparedSide = S["ComparedSideOut"];

export type Comparison = S["ComparisonOut"];

export type Announcement = S["AnnouncementOut"];

/** All a crest needs. A search hit has no id and should not have to
 *  invent one to be badged. */
export interface CrestSubject {
  name: string;
  initials?: string | null;
}

/** A ground's own page: everything `Field` has, plus who plays there. */
export type FieldDetail = S["FieldDetailOut"];

/** One row in the search results.
 *
 *  The same shape whatever was found, because the "Όλα" tab shows all three
 *  kinds in one list and a row that branches on its payload renders three ways.
 *  `kind` is only used to pick the destination and the little glyph.
 */
export type SearchHit = S["SearchHitOut"];

export type SearchResults = S["SearchOut"];

/** One name on the MVP ballot. */
export type MvpCandidate = S["MvpCandidateOut"];

export type MvpPoll = S["MvpPollOut"];

/* ---- Live log ---------------------------------------------------------- */

export type EventKind = S["MatchEventKind"];

export type FeedEvent = S["EventOut"];

export type MatchFeed = S["MatchFeedOut"];

/** One squad member offered when naming a scorer. The volunteer endpoint
 *  counts goals itself, so unlike `Scorer.goals` this is never null. */
export type RosterPlayer = S["RosterPlayerOut"];

/* ---- Match prediction -------------------------------------------------- */

export type PredictionChoice = S["PredictionChoice"];

export type PredictionPoll = S["PredictionPollOut"];
