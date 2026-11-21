"""Shared vocabulary. Every agent imports from here instead of hard-coding strings."""

# ---- Roles (README section 3) -------------------------------------------------
ROLE_CITIZEN = "citizen"
ROLE_OFFICER = "officer"        # municipal officer: command centre for own department
ROLE_WORKER = "worker"          # field worker / team: works assigned tickets, uploads evidence
ROLE_SUPERVISOR = "supervisor"  # verifies resolutions, approves reopen, sees all departments
ROLE_ADMIN = "admin"            # users, config, audit logs
ALL_ROLES = (ROLE_CITIZEN, ROLE_OFFICER, ROLE_WORKER, ROLE_SUPERVISOR, ROLE_ADMIN)
STAFF_ROLES = (ROLE_OFFICER, ROLE_WORKER, ROLE_SUPERVISOR, ROLE_ADMIN)
OFFICE_ROLES = (ROLE_OFFICER, ROLE_SUPERVISOR, ROLE_ADMIN)  # command-centre capable

# ---- Severity -----------------------------------------------------------------
SEVERITIES = ("low", "medium", "high", "critical")
SEVERITY_ORDER = {"low": 0, "medium": 1, "high": 2, "critical": 3}
# README section 5: 0-24 Low, 25-49 Medium, 50-74 High, 75-100 Critical
SEVERITY_THRESHOLDS = ((75, "critical"), (50, "high"), (25, "medium"), (0, "low"))

# ---- Status lifecycle (README section 6) --------------------------------------
STATUS_SUBMITTED = "submitted"
STATUS_AI_REVIEW = "ai_review"
STATUS_VERIFIED = "verified"
STATUS_ASSIGNED = "assigned"
STATUS_IN_PROGRESS = "in_progress"
STATUS_AWAITING_VERIFICATION = "awaiting_verification"
STATUS_RESOLVED = "resolved"
STATUS_REOPENED = "reopened"
STATUS_REJECTED = "rejected"
STATUS_DUPLICATE_LINKED = "duplicate_linked"
STATUSES = (
    STATUS_SUBMITTED, STATUS_AI_REVIEW, STATUS_VERIFIED, STATUS_ASSIGNED, STATUS_IN_PROGRESS,
    STATUS_AWAITING_VERIFICATION, STATUS_RESOLVED, STATUS_REOPENED, STATUS_REJECTED, STATUS_DUPLICATE_LINKED,
)
ACTIVE_STATUSES = (
    STATUS_SUBMITTED, STATUS_AI_REVIEW, STATUS_VERIFIED, STATUS_ASSIGNED, STATUS_IN_PROGRESS,
    STATUS_AWAITING_VERIFICATION, STATUS_REOPENED,
)
CLOSED_STATUSES = (STATUS_RESOLVED, STATUS_REJECTED, STATUS_DUPLICATE_LINKED)
# Allowed transitions: from -> set(to). Enforced server side by status_service.
STATUS_TRANSITIONS = {
    STATUS_SUBMITTED: {STATUS_AI_REVIEW, STATUS_VERIFIED, STATUS_ASSIGNED, STATUS_REJECTED, STATUS_DUPLICATE_LINKED},
    STATUS_AI_REVIEW: {STATUS_VERIFIED, STATUS_ASSIGNED, STATUS_REJECTED, STATUS_DUPLICATE_LINKED},
    STATUS_VERIFIED: {STATUS_ASSIGNED, STATUS_IN_PROGRESS, STATUS_REJECTED, STATUS_DUPLICATE_LINKED},
    STATUS_ASSIGNED: {STATUS_IN_PROGRESS, STATUS_VERIFIED, STATUS_REJECTED},
    STATUS_IN_PROGRESS: {STATUS_AWAITING_VERIFICATION, STATUS_ASSIGNED},
    STATUS_AWAITING_VERIFICATION: {STATUS_RESOLVED, STATUS_IN_PROGRESS},  # resolved ONLY via verify-resolution
    STATUS_RESOLVED: {STATUS_REOPENED},
    STATUS_REOPENED: {STATUS_ASSIGNED, STATUS_IN_PROGRESS, STATUS_VERIFIED},
    STATUS_REJECTED: set(),
    STATUS_DUPLICATE_LINKED: set(),
}

# ---- Categories (default taxonomy, stored in DB table `categories`) ------------
CATEGORIES = ("roads", "waste", "water", "electricity", "trees", "drainage", "public_infrastructure", "other")

# ---- Location -------------------------------------------------------------------
LOCATION_SOURCES = ("gps", "map_pin", "address_search")
SERVICE_AREA_IN = "in_area"
SERVICE_AREA_OUTSIDE = "outside_service_area"
SERVICE_AREA_MANUAL = "needs_manual_routing"

# ---- Languages (README section 1) ----------------------------------------------
LANGUAGES = {
    "kn": "ಕನ್ನಡ", "en": "English", "hi": "हिन्दी", "ta": "தமிழ்", "te": "తెలుగు", "ml": "മലയാളം",
}
LANGUAGE_NAMES_EN = {"kn": "Kannada", "en": "English", "hi": "Hindi", "ta": "Tamil", "te": "Telugu", "ml": "Malayalam"}

# ---- Image kinds --------------------------------------------------------------
IMG_REPORT = "report"
IMG_EVIDENCE = "evidence"   # extra evidence added by a citizen to an existing report
IMG_BEFORE = "before"
IMG_AFTER = "after"

# ---- Comment visibility --------------------------------------------------------
VIS_PUBLIC = "public"      # citizen-visible update
VIS_INTERNAL = "internal"  # private officer note (never returned to citizens)

# ---- Data source labels (honest simulation labelling, README section 22) --------
SRC_SIMULATED = "simulated"
SRC_WORKER = "worker"
SRC_SENSOR = "sensor"
