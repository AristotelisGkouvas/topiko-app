import enum


class MatchStatus(str, enum.Enum):
    SCHEDULED = "scheduled"      # ΠΡΟΣΕΧΩΣ
    LIVE = "live"                # ΤΩΡΑ ΖΩΝΤΑΝΑ
    HALFTIME = "halftime"        # ΗΜΙΧΡΟΝΟ
    FINISHED = "finished"        # ΤΕΛΙΚΟ
    POSTPONED = "postponed"      # ΑΝΑΒΟΛΗ
    CANCELLED = "cancelled"      # ΜΑΤΑΙΩΣΗ
    AWARDED = "awarded"          # ΑΝΑ ΤΟΥΣ ΑΓΩΝΕΣ (κατακύρωση 3-0 κ.λπ.)


class DataSource(str, enum.Enum):
    """Where the current value of a match record came from.

    Drives the reconciliation rule in the scraper: a manual edit that is newer
    than the last scrape wins until the match goes cold.
    """

    SCRAPER = "scraper"
    MANUAL_LIVE = "manual_live"
    MANUAL_CONFIRMED = "manual_confirmed"


class LeagueKind(str, enum.Enum):
    CHAMPIONSHIP = "championship"   # Α΄/Β΄/Γ΄ Κατηγορία
    CUP = "cup"                     # Κύπελλο
    PLAYOFF = "playoff"


class FieldSurface(str, enum.Enum):
    GRASS = "grass"                 # χλοοτάπητας
    ARTIFICIAL = "artificial"       # συνθετικός
    DIRT = "dirt"                   # χωμάτινο


class StandingZone(str, enum.Enum):
    PROMOTION = "promotion"         # άνοδος
    PROMOTION_PLAYOFF = "promotion_playoff"
    RELEGATION_PLAYOFF = "relegation_playoff"
    RELEGATION = "relegation"       # υποβιβασμός


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    EDITOR = "editor"


class ConflictStatus(str, enum.Enum):
    OPEN = "open"
    RESOLVED_MANUAL = "resolved_manual"     # κράτησε τη χειροκίνητη τιμή
    RESOLVED_SCRAPER = "resolved_scraper"   # κράτησε την τιμή του scraper


class ScrapeRunStatus(str, enum.Enum):
    RUNNING = "running"
    SUCCESS = "success"
    #: Finished, but something was skipped or could not be resolved.
    PARTIAL = "partial"
    FAILED = "failed"


class PredictionChoice(str, enum.Enum):
    """A reader's call. Named for the sides rather than 1-X-2, because the UI
    shows club names and the coupon shorthand means nothing to most people."""

    HOME = "home"
    DRAW = "draw"
    AWAY = "away"


class MatchEventKind(str, enum.Enum):
    """What the person on the touchline is recording.

    Penalties and own goals are separate kinds rather than a flag on a goal,
    because the ticker reads differently for each and a boolean would have to
    be interpreted at every call site.
    """

    GOAL = "goal"                    # ΓΚΟΛ
    PENALTY_GOAL = "penalty_goal"    # ΓΚΟΛ ΑΠΟ ΠΕΝΑΛΤΙ
    OWN_GOAL = "own_goal"            # ΑΥΤΟΓΚΟΛ
    PENALTY_MISS = "penalty_miss"    # ΧΑΜΕΝΟ ΠΕΝΑΛΤΙ
    YELLOW = "yellow"                # ΚΙΤΡΙΝΗ
    SECOND_YELLOW = "second_yellow"  # ΔΕΥΤΕΡΗ ΚΙΤΡΙΝΗ
    RED = "red"                      # ΚΟΚΚΙΝΗ
    SUBSTITUTION = "substitution"    # ΑΛΛΑΓΗ
    KICKOFF = "kickoff"              # ΣΕΝΤΡΑ
    HALFTIME = "halftime"            # ΗΜΙΧΡΟΝΟ
    SECOND_HALF = "second_half"      # Β ΗΜΙΧΡΟΝΟ
    FULLTIME = "fulltime"            # ΤΕΛΙΚΟ
    #: Ο αγώνας δεν έγινε, ή σταμάτησε και δεν συνεχίστηκε. Χωριστά από τη
    #: σημείωση, γιατί αλλάζουν την κατάσταση του αγώνα και όχι μόνο το log.
    POSTPONED = "postponed"          # ΑΝΑΒΟΛΗ
    ABANDONED = "abandoned"          # ΔΙΑΚΟΠΗ
    NOTE = "note"                    # ΣΗΜΕΙΩΣΗ
