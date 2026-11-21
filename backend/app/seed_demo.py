"""Demo data seeder ("Demo data" - everything created here is FICTIONAL and flagged is_demo=True).

`seed(db)` is idempotent and safe to run on every start:
  * demo user accounts are created only when their e-mail does not exist yet;
  * demo complaints are created only when NO complaint with is_demo=True exists (that is the marker);
  * the certificate for the demo citizen's verified complaint is (re)tried on every run because
    certificate_service.issue_for_complaint is itself idempotent.

What is deliberately NOT invented: no city corporation / zone / ward code and no boundary dataset version is set
(official boundary polygons are not bundled). Every complaint is therefore `needs_manual_routing`.
Coordinates are plausible, approximate points near well-known Bengaluru localities, not surveyed locations.
Descriptions in Kannada/Hindi/Tamil/Telugu/Malayalam and their English translations are machine-written for the
demo and have not been reviewed by native speakers.
"""
from __future__ import annotations

import io
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.core.demo_accounts import DEMO_ACCOUNTS
from app.core.security import hash_password
from app.core.user_store import get_user_store
from app.models import (
    AiAnalysis, Assignment, Comment, Complaint, ComplaintFollower, ComplaintSubmission, DuplicateCandidate,
    Notification, ResolutionEvidence, StatusHistory, VoiceTranscript,
)
from app.models.base import utcnow
from app.seed_reference import CATEGORIES as _REF_CATEGORIES, ROUTING_RULES as _REF_RULES
from app.services import priority_service
from app.services.notification_service import notify
from app.services.upload_service import save_image_bytes

log = logging.getLogger("civiclens.seed_demo")

DEMO_TAG = "(demo citizen)"

# Extra FICTIONAL demo residents (not shown on the login page): they make the community-incident and the
# multi-language examples possible. Same password as the other demo accounts.
EXTRA_DEMO_CITIZENS = [
    # (email, display_name, role, department_code, preferred_language)
    ("neighbour1@civiclens.demo", f"Meera Nair {DEMO_TAG}", "citizen", None, "ml"),
    ("neighbour2@civiclens.demo", f"Imran Sheikh {DEMO_TAG}", "citizen", None, "hi"),
    ("neighbour3@civiclens.demo", f"Lakshmi Iyer {DEMO_TAG}", "citizen", None, "ta"),
    ("neighbour4@civiclens.demo", f"Sai Reddy {DEMO_TAG}", "citizen", None, "te"),
]

# Approximate locality centres (lat, lng). Demo coordinates only - not surveyed.
LOCALITIES: Dict[str, tuple] = {
    "Malleshwaram": (13.0035, 77.5710),
    "Rajajinagar": (12.9915, 77.5520),
    "Vijayanagar": (12.9719, 77.5330),
    "Shivajinagar": (12.9857, 77.6057),
    "Indiranagar": (12.9784, 77.6408),
    "Whitefield": (12.9698, 77.7500),
    "Koramangala": (12.9352, 77.6245),
    "Jayanagar": (12.9250, 77.5938),
    "Basavanagudi": (12.9416, 77.5752),
    "JP Nagar": (12.9063, 77.5857),
}

CHAIN = ["submitted", "ai_review", "verified", "assigned", "in_progress", "awaiting_verification", "resolved"]
OFFSET_HOURS = {"submitted": 0.0, "ai_review": 0.03, "verified": 3.0, "assigned": 6.0, "in_progress": 20.0,
                "awaiting_verification": 44.0, "resolved": 52.0}
HISTORY_NOTE = {
    "submitted": "Report submitted",
    "ai_review": "AI triage completed",
    "verified": "Classification checked by an officer",
    "assigned": "Assigned to a field team",
    "in_progress": "Work started at the location",
    "awaiting_verification": "Work completed - awaiting supervisor verification",
    "resolved": "Resolution verified by a supervisor",
}


@dataclass
class Spec:
    key: str
    who: str                      # e-mail local alias: citizen | citizen2 | neighbour1..4
    cat: str
    sub: str
    lang: str
    text: str
    en: Optional[str]             # English translation (None for English reports)
    summary: str
    sev: str
    score: float
    reason: str
    conf: float
    locality: str
    days: float                   # age in days
    status: str
    worker: Optional[str] = None  # worker1 | worker2
    via: str = "text"
    review: List[str] = field(default_factory=list)   # extra review reasons (also forces requires_human_review)
    off: tuple = (0.0, 0.0)       # (dlat, dlng) offset from the locality centre
    evidence: Optional[str] = None  # before | pair_unverified | pair_verified
    source: str = "gps"
    dup_of: Optional[str] = None  # key of an earlier same-user report nearby (duplicate scenario)
    dup_reason: Optional[str] = None


SPECS: List[Spec] = [
    Spec("C01", "citizen", "roads", "pothole", "en",
         "Deep pothole on the main road near the metro station. Two-wheelers swerve to avoid it and a car scraped its bumper yesterday.",
         None, "Deep pothole on a busy road near a metro station causing vehicles to swerve.", "high", 62.0,
         "Deep pothole on a busy road - risk of falls and vehicle damage.", 0.88, "Indiranagar", 6.0, "verified"),
    Spec("C02", "citizen", "roads", "pothole", "en",
         "There is a big hole in the tarmac just ahead of the metro pillar, about two feet wide. Bikes have to move into the traffic lane to go around it.",
         None, "Wide hole in the road surface by a metro pillar forcing bikes into the traffic lane.", "high", 56.0,
         "Wide road hole by a pillar pushes bikes into traffic - fall and collision risk.", 0.81, "Indiranagar", 1.0,
         "ai_review", off=(0.0007, 0.0001), dup_of="C01",
         dup_reason="I think this is a different hole, a little further along the same road."),
    Spec("C03", "citizen", "waste", "overflowing_bin", "en",
         "The community bin at the corner is overflowing and rubbish is spilling onto the footpath. It has not been cleared for two days.",
         None, "Overflowing community bin spilling rubbish onto the footpath.", "medium", 40.0,
         "Overflowing public bin spilling onto the footpath - hygiene nuisance.", 0.86, "Malleshwaram", 2.0, "ai_review"),
    Spec("C04", "citizen", "waste", "overflowing_bin", "en",
         "Garbage pile next to the bin in the next lane. Crows and stray dogs are scattering it across the road.",
         None, "Garbage heap beside a bin being scattered across the lane.", "medium", 36.0,
         "Garbage pile beside a bin being scattered - hygiene and nuisance concern.", 0.72, "Malleshwaram", 0.8,
         "submitted", off=(0.0002, 0.0007), dup_of="C03",
         dup_reason="This is the next lane, not the same bin."),
    Spec("C05", "citizen2", "roads", "pothole", "kn",
         "ನಮ್ಮ ರಸ್ತೆಯಲ್ಲಿ ದೊಡ್ಡ ಗುಂಡಿ ಬಿದ್ದಿದೆ. ದ್ವಿಚಕ್ರ ವಾಹನಗಳು ಬೀಳುವ ಅಪಾಯವಿದೆ.",
         "There is a big pothole on our road. Two-wheelers are at risk of falling.",
         "Large pothole on a residential road with a fall risk for two-wheelers.", "high", 58.0,
         "Deep pothole on a road used by two-wheelers - fall risk.", 0.79, "Rajajinagar", 9.0, "assigned",
         worker="worker1", via="voice", off=(0.0010, -0.0012)),
    Spec("C06", "citizen2", "electricity", "broken_streetlight", "kn",
         "ಬೀದಿ ದೀಪ ಕಳೆದ ಮೂರು ದಿನಗಳಿಂದ ಉರಿಯುತ್ತಿಲ್ಲ. ರಾತ್ರಿ ಈ ರಸ್ತೆ ತುಂಬಾ ಕತ್ತಲೆಯಾಗಿದೆ.",
         "The streetlight has not been working for the last three days. This road is very dark at night.",
         "Non-working streetlight leaving a road dark at night.", "medium", 34.0,
         "Dark stretch at night from a non-working streetlight - safety concern.", 0.83, "Vijayanagar", 14.0,
         "in_progress", worker="worker2", evidence="before", off=(-0.0009, 0.0008), source="map_pin"),
    Spec("C07", "citizen2", "waste", "overflowing_bin", "kn",
         "ಕಸದ ಡಬ್ಬಿ ತುಂಬಿ ಹೊರಗೆ ಚೆಲ್ಲುತ್ತಿದೆ. ಎರಡು ದಿನಗಳಿಂದ ಕಸ ತೆಗೆದಿಲ್ಲ.",
         "The garbage bin is full and spilling out. The waste has not been collected for two days.",
         "Full garbage bin spilling over; no collection for two days.", "medium", 38.0,
         "Overflowing bin not cleared for two days - hygiene nuisance.", 0.57, "Basavanagudi", 0.5, "ai_review",
         review=["AI confidence below 0.6 - check classification"], off=(0.0006, 0.0004)),
    Spec("C08", "neighbour1", "drainage", "flooding", "ml",
         "റോഡിൽ വെള്ളം കെട്ടിക്കിടക്കുന്നു, ഓടയിൽ തടസ്സമുണ്ട്. വാഹനങ്ങൾക്ക് പോകാൻ ബുദ്ധിമുട്ടാണ്.",
         "Water is standing on the road and the drain is blocked. It is difficult for vehicles to pass.",
         "Waterlogged road caused by a blocked drain, hindering vehicles.", "high", 60.0,
         "Road waterlogged by a blocked drain - hinders vehicles.", 0.77, "Koramangala", 3.0, "assigned",
         worker="worker1", off=(-0.0014, 0.0010)),
    Spec("C09", "neighbour1", "roads", "broken_footpath", "ml",
         "ഫുട്പാത്ത് തകർന്നിരിക്കുന്നു, നടക്കാൻ ബുദ്ധിമുട്ടാണ്.",
         "The footpath is broken and it is difficult to walk.",
         "Broken footpath that is hard to walk on.", "low", 18.0,
         "Broken footpath slab - inconvenience, low immediate danger.", 0.8, "Jayanagar", 30.0, "resolved",
         worker="worker1", evidence="pair_verified", off=(0.0012, -0.0010), source="address_search"),
    Spec("C10", "neighbour2", "drainage", "open_manhole", "hi",
         "सड़क के बीच में खुला मैनहोल है, ढक्कन गायब है। रात में बहुत खतरनाक है।",
         "There is an open manhole in the middle of the road with the cover missing. It is very dangerous at night.",
         "Open manhole without a cover in the middle of a road.", "critical", 86.0,
         "Open manhole in the roadway at night - serious fall and vehicle danger.", 0.84, "Shivajinagar", 2.0,
         "ai_review", via="voice", off=(0.0008, 0.0006),
         review=["Critical severity - human review required",
                 "Open manhole is a safety hazard; could be sewer (BWSSB) or storm drain - human review."]),
    Spec("C11", "neighbour2", "waste", "litter", "hi",
         "सड़क के किनारे लोग कचरा फेंक रहे हैं, वहाँ गंदगी जमा हो गई है।",
         "People are dumping garbage by the roadside and filth has built up there.",
         "Roadside garbage dumping with filth building up.", "low", 15.0,
         "Roadside dumping - nuisance, no immediate danger.", 0.74, "Whitefield", 0.3, "submitted",
         off=(0.0010, 0.0014)),
    Spec("C12", "neighbour2", "electricity", "exposed_wiring", "hi",
         "बिजली का तार टूटकर सड़क पर लटक रहा है। यह बच्चों के स्कूल जाने का रास्ता है।",
         "An electric wire has snapped and is hanging over the road. This is the route children take to school.",
         "Snapped electric wire hanging over a road used by schoolchildren.", "critical", 92.0,
         "Snapped wire hanging over a school route - possible live-wire danger to life.", 0.9, "JP Nagar", 0.5,
         "ai_review", off=(0.0005, -0.0007),
         review=["Critical severity - human review required",
                 "Possible live-wire hazard: urgent human escalation to BESCOM / emergency handling."]),
    Spec("C13", "neighbour3", "water", "pipe_leak", "ta",
         "எங்கள் தெருவில் குடிநீர் குழாயில் இருந்து தண்ணீர் கசிந்து கொண்டே இருக்கிறது.",
         "Water keeps leaking from the drinking water pipe on our street.",
         "Continuous leak from a drinking-water pipe in a street.", "medium", 42.0,
         "Continuous leak from a drinking-water pipe - water loss.", 0.82, "Whitefield", 4.0, "verified",
         off=(-0.0011, -0.0009)),
    Spec("C14", "neighbour3", "electricity", "broken_streetlight", "ta",
         "தெரு விளக்கு எரியவில்லை, இரவில் இருட்டாக இருக்கிறது.",
         "The streetlight is not working and it is dark at night.",
         "Non-working streetlight leaving the street dark at night.", "medium", 32.0,
         "Dark stretch at night from a non-working streetlight.", 0.85, "Malleshwaram", 18.0,
         "awaiting_verification", worker="worker2", evidence="pair_unverified", off=(-0.0012, 0.0011)),
    Spec("C15", "neighbour3", "roads", "damaged_road", "ta",
         "சாலையில் பெரிய குழி உள்ளது. வாகனங்கள் செல்ல சிரமப்படுகின்றன.",
         "There is a big pit on the road. Vehicles are struggling to pass.",
         "Large pit in the road surface slowing traffic.", "medium", 45.0,
         "Large pit in the carriageway slows traffic and can damage vehicles.", 0.76, "JP Nagar", 11.0,
         "in_progress", worker="worker1", off=(-0.0010, 0.0012)),
    Spec("C16", "neighbour4", "drainage", "blocked_drain", "te",
         "మా వీధిలో మురుగు కాలువ మూసుకుపోయి నీరు రోడ్డుపై పారుతోంది.",
         "The drain in our street is blocked and water is flowing onto the road.",
         "Blocked drain sending water across the road.", "medium", 44.0,
         "Blocked drain pushing water onto the road.", 0.78, "Vijayanagar", 2.0, "ai_review", off=(0.0011, 0.0013)),
    Spec("C17", "neighbour4", "public_infrastructure", "damaged_bench", "te",
         "బస్ స్టాప్ దగ్గర బెంచీ విరిగిపోయింది, కూర్చోవడానికి వీలు లేదు.",
         "The bench near the bus stop is broken and there is nowhere to sit.",
         "Broken bench at a bus stop.", "low", 14.0,
         "Broken bench at a bus stop - minor inconvenience.", 0.7, "Basavanagudi", 0.2, "submitted",
         off=(-0.0010, -0.0008)),
    Spec("C18", "neighbour4", "waste", "litter", "te",
         "రోడ్డు పక్కన చెత్త కుప్పలుగా పడి ఉంది, ఎవరూ శుభ్రం చేయడం లేదు.",
         "Garbage is lying in heaps by the roadside and nobody is cleaning it.",
         "Heaps of roadside garbage that are not being cleared.", "medium", 33.0,
         "Roadside waste heaps not being cleared - hygiene nuisance.", 0.75, "Rajajinagar", 5.0, "assigned",
         worker="worker2", off=(-0.0012, 0.0009)),
    Spec("C19", "citizen", "trees", "dangerous_branch", "en",
         "A large dead branch is hanging over the pavement outside the school gate and looks ready to fall.",
         None, "Large dead branch hanging over a pavement near a school gate.", "medium", 48.0,
         "Dead branch over a footpath near a school gate - could fall on pedestrians.", 0.84, "Koramangala", 2.0,
         "assigned", worker="worker1", off=(0.0013, -0.0011), source="map_pin"),
    Spec("C20", "citizen", "water", "sewage_overflow", "en",
         "Sewage is overflowing from a manhole near the market and flowing along the road. The smell is very strong and people are walking through it.",
         None, "Sewage overflowing from a manhole and flowing along a market road.", "high", 64.0,
         "Sewage on a busy road - health risk to pedestrians.", 0.87, "Shivajinagar", 8.0, "in_progress",
         worker="worker1", off=(-0.0009, -0.0010)),
    Spec("C21", "citizen", "roads", "pothole", "en",
         "Large pothole at the junction near the park. Water collects in it after rain and scooters skid.",
         None, "Large pothole at a junction that fills with water after rain.", "high", 52.0,
         "Large pothole at a junction that holds water after rain.", 0.89, "Koramangala", 22.0, "resolved",
         worker="worker1", evidence="pair_verified", off=(-0.0016, -0.0013)),
    Spec("C22", "citizen2", "trees", "fallen_tree", "kn",
         "ಮಳೆಗೆ ದೊಡ್ಡ ಮರ ರಸ್ತೆಗೆ ಬಿದ್ದಿದೆ. ವಾಹನ ಸಂಚಾರ ನಿಂತಿದೆ.",
         "A large tree has fallen onto the road in the rain. Vehicle traffic has stopped.",
         "Large tree fallen across a road, blocking traffic.", "high", 72.0,
         "Fallen tree blocking the road - traffic stopped.", 0.91, "Basavanagudi", 20.0, "resolved",
         worker="worker1", evidence="pair_verified", off=(0.0014, 0.0012)),
    Spec("C23", "neighbour4", "waste", "missed_collection", "te",
         "చాలా రోజులుగా చెత్త తీసుకెళ్లడం లేదు, వీధిలో దుర్వాసన వస్తోంది.",
         "Garbage has not been collected for many days and the street smells bad.",
         "Garbage not collected for several days, causing a bad smell.", "medium", 35.0,
         "Waste uncollected for several days - hygiene concern.", 0.8, "Whitefield", 7.0, "in_progress",
         worker="worker2", off=(0.0015, -0.0006)),
    Spec("C24", "citizen2", "water", "pipe_leak", "kn",
         "ಮುಖ್ಯ ನೀರಿನ ಪೈಪ್ ಒಡೆದು ರಸ್ತೆಯ ಮೇಲೆ ನೀರು ಹರಿಯುತ್ತಿದೆ.",
         "The main water pipe has burst and water is flowing onto the road.",
         "Burst main water pipe flooding a road.", "high", 55.0,
         "Burst main pipe flooding the road - water loss and traffic disruption.", 0.86, "Jayanagar", 3.0, "verified"),
    Spec("C25", "citizen", "public_infrastructure", "bus_shelter", "en",
         "The roof panel of the bus shelter is broken and there is no seating left, so people wait in the sun.",
         None, "Bus shelter with a broken roof panel and no seating.", "low", 20.0,
         "Damaged shelter roof leaves commuters exposed - minor inconvenience.", 0.77, "Shivajinagar", 3.0,
         "submitted", off=(0.0016, 0.0010), source="address_search"),
    Spec("C26", "citizen", "electricity", "power_outage", "en",
         "No power in our lane since early morning. Neighbouring streets seem to have electricity.",
         None, "Power outage affecting one residential lane.", "medium", 44.0,
         "Reported supply outage in a residential lane - inconvenience.", 0.7, "Rajajinagar", 0.4, "submitted",
         off=(0.0012, 0.0013)),
]

COMMUNITY_KEY = "C24"
COMMUNITY_SUPPORT = [
    ("neighbour1", "ml", "ജയനഗറിൽ ഇതേ പൈപ്പ് പൊട്ടി വെള്ളം പാഴാകുന്നത് ഞാനും കണ്ടു."),
    ("neighbour2", "hi", "मैंने भी यह रिसाव देखा है, सड़क पर पानी भर गया है।"),
    ("neighbour3", "ta", "இங்கே குழாய் உடைந்து தண்ணீர் வீணாகிறது, நானும் பார்த்தேன்."),
]
COMMUNITY_FOLLOWERS = ["citizen", "neighbour4"]
CITIZEN_FOLLOWS = ["C08", "C24"]          # the demo citizen follows these (so "following" is not empty)
CERT_KEY = "C21"                          # resolved + verified complaint of the demo citizen


# ----------------------------------------------------------------------------------------------- helpers
def _alias(email: str) -> str:
    return email.split("@")[0]


def _haversine_m(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _route(cat: str, sub: str):
    """Starting routing rules from seed_reference (most specific wins). Returns (dept, agency_kind, review, note)."""
    best = None
    for rcat, rsub, dept, kind, review, _minsev, note in _REF_RULES:
        if rcat != cat:
            continue
        if rsub == sub:
            return dept, kind, review, note
        if rsub is None:
            best = (dept, kind, review, note)
    if best:
        return best
    default = next((c[3] for c in _REF_CATEGORIES if c[0] == cat), "municipal_triage")
    return default, "corporation", False, None


def _placeholder_png(label: str, colour: tuple) -> bytes:
    img = Image.new("RGB", (360, 220), colour)
    d = ImageDraw.Draw(img)
    try:
        big = ImageFont.load_default(size=34)
        small = ImageFont.load_default(size=16)
    except Exception:  # very old Pillow
        big = small = ImageFont.load_default()
    d.rectangle([6, 6, 353, 213], outline=(255, 255, 255), width=3)
    w = d.textlength(label, font=big)
    d.text(((360 - w) / 2, 80), label, fill=(255, 255, 255), font=big)
    tag = "Demo data - placeholder image"
    w2 = d.textlength(tag, font=small)
    d.text(((360 - w2) / 2, 150), tag, fill=(240, 240, 240), font=small)
    out = io.BytesIO()
    img.save(out, format="PNG")
    return out.getvalue()


def _ensure_users(include_extra: bool = True) -> Dict[str, Dict[str, Any]]:
    """Create missing demo users (skip when e-mail exists). Returns alias -> user dict."""
    store = get_user_store()
    pw_hash: Optional[str] = None
    out: Dict[str, Dict[str, Any]] = {}
    for email, name, role, dept, lang in [*DEMO_ACCOUNTS, *(EXTRA_DEMO_CITIZENS if include_extra else [])]:
        u = store.get_by_email(email)
        if u is None:
            if pw_hash is None:
                pw_hash = hash_password(settings.DEMO_PASSWORD)
            try:
                u = store.create(email=email, password_hash=pw_hash, display_name=name, role=role,
                                 department_code=dept, preferred_language=lang, is_demo=True)
            except Exception as exc:  # duplicate-key race with a parallel worker
                if type(exc).__name__ not in ("DuplicateKeyError", "IntegrityError"):
                    raise
                u = store.get_by_email(email)
        out[_alias(email)] = u
    return out


def seed_accounts() -> None:
    """Only the demo LOGINS (no complaints, vehicles or bins). Used when SEED_DEMO_ACCOUNTS is on and SEED_DEMO_DATA is off."""
    _ensure_users(include_extra=False)


def _officer_for(dept: Optional[str], users: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    for email, _n, role, d, _l in DEMO_ACCOUNTS:
        if role == "officer" and d == dept:
            return users[_alias(email)]
    return users["supervisor"]


def _timeline(created: datetime, status: str, age_hours: float) -> List[tuple]:
    """[(to_status, from_status, datetime)] along CHAIN up to `status`, squeezed into the complaint's age."""
    steps = CHAIN[: CHAIN.index(status) + 1]
    last = OFFSET_HOURS[steps[-1]]
    scale = 1.0 if last <= age_hours * 0.85 else (age_hours * 0.85) / last
    rows, prev = [], None
    for st in steps:
        rows.append((st, prev, created + timedelta(hours=OFFSET_HOURS[st] * scale)))
        prev = st
    return rows


def _retry_certificate(db: Session, users: Dict[str, Dict[str, Any]]) -> None:
    """Issue (idempotently) the certificate for the demo citizen's verified, resolved complaint."""
    try:
        from app.core.deps import CurrentUser
        from app.services import certificate_service

        citizen = users["citizen"]
        c = db.scalars(
            select(Complaint).where(Complaint.is_demo == True, Complaint.created_by_user_id == citizen["id"],  # noqa: E712
                                    Complaint.status == "resolved", Complaint.verified_by_user_id.is_not(None))
            .order_by(Complaint.id)
        ).first()
        if c is None:
            return
        sup = users["supervisor"]
        sup_user = CurrentUser(id=sup["id"], email=sup["email"], display_name=sup["display_name"], role=sup["role"],
                               department_code=sup.get("department_code"), corporation_code=sup.get("corporation_code"),
                               preferred_language=sup.get("preferred_language") or "en")
        cert = certificate_service.issue_for_complaint(db, c, sup_user)
        db.commit()
        log.info("demo certificate: %s", "issued/exists" if cert else "not issued (recognition service returned None)")
    except Exception as exc:  # never fail seeding because of the certificate
        db.rollback()
        log.warning("demo certificate not issued: %s", exc)


# ----------------------------------------------------------------------------------------------- main
def seed(db: Session) -> None:
    users = _ensure_users()   # first: user store may use its own session/connection

    already = db.scalar(select(func.count()).select_from(Complaint).where(Complaint.is_demo == True))  # noqa: E712
    if already:
        log.info("demo complaints already present (%s) - skipping complaint seeding", already)
        _retry_certificate(db, users)
        return

    now = utcnow()
    supervisor = users["supervisor"]
    by_key: Dict[str, Complaint] = {}
    created_rows: List[tuple] = []  # (spec, complaint, timeline)

    for spec in sorted(SPECS, key=lambda s: -s.days):   # oldest first => ticket ids grow with time
        reporter = users[spec.who]
        created = now - timedelta(days=spec.days)
        age_h = spec.days * 24
        dept, kind, rule_review, note = _route(spec.cat, spec.sub)
        base = LOCALITIES[spec.locality]
        lat, lng = round(base[0] + spec.off[0], 6), round(base[1] + spec.off[1], 6)
        review_reasons = list(spec.review)
        needs_review = bool(spec.review)
        timeline = _timeline(created, spec.status, age_h)
        confirmed = CHAIN.index(spec.status) >= CHAIN.index("verified")
        worker = users[spec.worker] if spec.worker else None

        c = Complaint(
            created_by_user_id=reporter["id"], original_description=spec.text, original_language=spec.lang,
            translated_description=spec.en, summary=spec.summary, submitted_via=spec.via,
            category=spec.cat, subcategory=spec.sub, severity=spec.sev, severity_score=spec.score,
            severity_reason=spec.reason, severity_overridden=False, ai_confidence=spec.conf, ai_provider="rules",
            requires_human_review=needs_review, review_reasons=review_reasons, image_observations=[],
            classification_confirmed=confirmed,
            authoritative_department_code=dept, responsible_agency_kind=kind, routing_note=note,
            status=spec.status, assigned_worker_id=worker["id"] if worker else None,
            is_demo=True,
            latitude=lat, longitude=lng, location_accuracy_m=None if spec.source == "map_pin" else float(8 + (int(spec.key[1:]) * 7) % 25),
            location_source=spec.source, location_captured_at=created,
            location_address=f"{spec.locality}, Bengaluru (demo location, approximate)", locality=spec.locality,
            service_area_status="needs_manual_routing", city_corporation_code=None, division_code=None,
            ward_code=None, boundary_dataset_version=None,
            created_at=created, updated_at=timeline[-1][2],
        )
        if spec.status == "resolved":
            c.resolved_at = timeline[-1][2]
            c.verified_by_user_id = supervisor["id"]
        db.add(c)
        db.flush()
        c.public_ticket_number = f"CL-{created.year}-{c.id:05d}"
        try:
            c.sla_due_at = priority_service.sla_due_for(db, spec.cat, spec.sev, dept, start=created)
        except Exception as exc:
            log.warning("sla_due_for failed (%s); using +72h", exc)
            c.sla_due_at = created + timedelta(hours=72)
        by_key[spec.key] = c
        created_rows.append((spec, c, timeline))

        # primary submission (+ voice transcript where the report came by voice)
        sub = ComplaintSubmission(
            complaint_id=c.id, user_id=reporter["id"], description=spec.text, language=spec.lang, via=spec.via,
            is_primary=True, duplicate_choice="different" if spec.dup_of else "new",
            duplicate_override_reason=spec.dup_reason, created_at=created)
        db.add(sub)
        if spec.via == "voice":
            db.add(VoiceTranscript(
                user_id=reporter["id"], complaint_id=c.id, selected_language=spec.lang, detected_language=spec.lang,
                original_transcript=spec.text, confirmed_transcript=spec.text,
                model="demo-seed (no real audio was recorded)", duration_seconds=14.0, created_at=created))

        # AI analysis audit copy (rules provider, concise output only)
        db.add(AiAnalysis(
            complaint_id=c.id, provider="rules", model=None, prompt_version="v1", created_at=created + timedelta(minutes=1),
            result={"language": spec.lang, "category": spec.cat, "subcategory": spec.sub, "summary": spec.summary,
                    "translated_description": spec.en, "severity": spec.sev, "severity_score": spec.score,
                    "reason": spec.reason, "department_code": dept, "agency_kind": kind, "routing_note": note,
                    "confidence": spec.conf, "image_observations": [], "requires_human_review": needs_review,
                    "review_reasons": review_reasons, "provider": "rules", "model": None,
                    "photo_analysis": "not_provided", "notes": ["Demo data - seeded result"]}))

        # status history consistent with the final status
        actor_by_status = {
            "submitted": (reporter["id"], "citizen"),
            "ai_review": (None, "system"),
            "verified": None, "assigned": None, "in_progress": None, "awaiting_verification": None,
            "resolved": (supervisor["id"], "supervisor"),
        }
        officer = _officer_for(dept, users)
        actor_by_status["verified"] = (officer["id"], "officer")
        actor_by_status["assigned"] = (officer["id"], "officer")
        w_actor = (worker["id"], "worker") if worker else (officer["id"], "officer")
        actor_by_status["in_progress"] = w_actor
        actor_by_status["awaiting_verification"] = w_actor
        for to_status, from_status, at in timeline:
            aid, arole = actor_by_status[to_status]
            db.add(StatusHistory(complaint_id=c.id, from_status=from_status, to_status=to_status, actor_user_id=aid,
                                 actor_role=arole, note=HISTORY_NOTE[to_status], citizen_visible=True, created_at=at))

        times = {st: at for st, _f, at in timeline}
        # assignment
        if worker is not None:
            db.add(Assignment(complaint_id=c.id, worker_user_id=worker["id"], department_code=dept,
                              assigned_by_user_id=officer["id"], note="Demo assignment",
                              active=spec.status != "resolved", created_at=times.get("assigned", created)))

        # comments (a few public + internal)
        def _comment(author, role, body, visibility, at):
            db.add(Comment(complaint_id=c.id, author_user_id=author["id"], author_role=role,
                           author_name=author["display_name"], body=body, visibility=visibility, created_at=at))

        if "verified" in times:
            _comment(officer, "officer", "Classification checked against the description. Routing follows the default department rule.",
                     "internal", times["verified"] + timedelta(minutes=5))
        if spec.review and spec.sev == "critical":
            _comment(officer, "officer",
                     "Safety hazard: escalate to the responsible utility at once. CivicLens is not an emergency service - "
                     "if anyone is at immediate risk, use the local emergency helpline.", "internal", created + timedelta(minutes=20))
        if "assigned" in times:
            _comment(officer, "officer", "A field team has been assigned to your report.", "public",
                     times["assigned"] + timedelta(minutes=2))
        if "in_progress" in times and worker:
            _comment(worker, "worker", "Team has reached the location and work has started.", "public",
                     times["in_progress"] + timedelta(minutes=10))
        if "awaiting_verification" in times and worker:
            _comment(worker, "worker", "Work completed. Before and after photos uploaded - please verify.", "internal",
                     times["awaiting_verification"] + timedelta(minutes=5))
        if "resolved" in times:
            _comment(supervisor, "supervisor", "Resolution verified. Thank you for reporting.", "public",
                     times["resolved"] + timedelta(minutes=3))

        # before / after sample evidence (tiny Pillow placeholders)
        if spec.evidence and worker is not None:
            before = save_image_bytes(db, _placeholder_png("DEMO BEFORE", (120, 70, 50)), complaint_id=c.id,
                                      user_id=worker["id"], kind="before")
            before.created_at = times.get("in_progress", created)
            db.add(ResolutionEvidence(complaint_id=c.id, uploaded_by_user_id=worker["id"], kind="before",
                                      image_id=before.id, notes="Demo placeholder image - before work",
                                      verified=spec.evidence == "pair_verified",
                                      verified_by_user_id=supervisor["id"] if spec.evidence == "pair_verified" else None,
                                      verified_at=times.get("resolved") if spec.evidence == "pair_verified" else None,
                                      created_at=times.get("in_progress", created)))
            if spec.evidence in ("pair_verified", "pair_unverified"):
                after = save_image_bytes(db, _placeholder_png("DEMO AFTER", (50, 105, 70)), complaint_id=c.id,
                                         user_id=worker["id"], kind="after")
                after.created_at = times.get("awaiting_verification", created)
                ok = spec.evidence == "pair_verified"
                db.add(ResolutionEvidence(complaint_id=c.id, uploaded_by_user_id=worker["id"], kind="after",
                                          image_id=after.id, notes="Demo placeholder image - after work", verified=ok,
                                          verified_by_user_id=supervisor["id"] if ok else None,
                                          verified_at=times.get("resolved") if ok else None,
                                          created_at=times.get("awaiting_verification", created)))

        # same-user nearby duplicate scenario: remember what the citizen was shown
        if spec.dup_of:
            first = by_key[spec.dup_of]
            dist = _haversine_m(first.latitude, first.longitude, lat, lng)
            db.add(DuplicateCandidate(complaint_id=c.id, candidate_complaint_id=first.id, user_id=reporter["id"],
                                      distance_m=round(dist, 1), similarity=0.58, same_reporter=True,
                                      decision="continued_new", created_at=created))

    db.flush()

    # ---- community incident: 3 supporting submissions from different demo users + followers
    inc = by_key[COMMUNITY_KEY]
    inc_created = inc.created_at
    for i, (alias, lang, text) in enumerate(COMMUNITY_SUPPORT, start=1):
        db.add(ComplaintSubmission(complaint_id=inc.id, user_id=users[alias]["id"], description=text, language=lang,
                                   via="text", is_primary=False, duplicate_choice="add_evidence",
                                   created_at=inc_created + timedelta(hours=2 * i)))
    for alias in COMMUNITY_FOLLOWERS:
        db.add(ComplaintFollower(complaint_id=inc.id, user_id=users[alias]["id"],
                                 created_at=inc_created + timedelta(hours=7)))
    for key in CITIZEN_FOLLOWS:
        if key == COMMUNITY_KEY:
            continue  # already follows via COMMUNITY_FOLLOWERS
        db.add(ComplaintFollower(complaint_id=by_key[key].id, user_id=users["citizen"]["id"],
                                 created_at=by_key[key].created_at + timedelta(hours=5)))
    db.flush()

    # ---- priority (uses the public service; it may still be a stub - fine)
    for spec, c, timeline in created_rows:
        try:
            c.priority_score = float(priority_service.compute_priority(db, c))
        except Exception as exc:
            log.warning("compute_priority failed (%s); using severity only", exc)
            c.priority_score = {"low": 0.0, "medium": 20.0, "high": 40.0, "critical": 60.0}[c.severity]
        c.updated_at = timeline[-1][2]   # set explicitly so onupdate does not stamp 'now'
    db.flush()

    # ---- notifications for the demo citizen
    citizen_id = users["citizen"]["id"]
    notes: List[Notification] = []
    for spec, c, timeline in created_rows:
        if spec.who != "citizen":
            continue
        n = notify(db, citizen_id, "complaint_submitted", "Report submitted",
                   f"Your report {c.public_ticket_number} was received. (Demo data)", c.id, c.public_ticket_number)
        n.created_at = c.created_at
        notes.append(n)
        for to_status, _f, at in timeline[2:]:
            title = {"verified": "An officer checked your report", "assigned": "A field team has been assigned",
                     "in_progress": "Work has started", "awaiting_verification": "Work done - awaiting verification",
                     "resolved": "Your report was resolved"}[to_status]
            m = notify(db, citizen_id, "status_update", title, f"{c.public_ticket_number}: {HISTORY_NOTE[to_status]}.",
                       c.id, c.public_ticket_number)
            m.created_at = at
            notes.append(m)
    inc_n = notify(db, citizen_id, "followed_update", "A report you follow was updated",
                   f"{inc.public_ticket_number}: more neighbours confirmed this issue. (Demo data)", inc.id,
                   inc.public_ticket_number)
    inc_n.created_at = inc_created + timedelta(hours=8)
    notes.append(inc_n)
    notes.sort(key=lambda n: n.created_at)
    for n in notes[:-4]:       # older ones are read, the latest few stay unread
        n.read = True

    db.commit()
    log.info("demo data seeded: %s complaints, %s demo accounts", len(created_rows), len(users))

    _retry_certificate(db, users)
