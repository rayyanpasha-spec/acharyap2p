"""Idempotent seed for the CivicVerse games and the achievements catalogue."""
from sqlalchemy.orm import Session

from app.models import Achievement, Game

GAMES = [
    ("clean_city", "Clean City Challenge",
     "Sort 12 everyday waste items into the right bin: wet, dry, recyclable, e-waste or hazardous.", 100, 5),
    ("civic_quiz", "Civic Quiz Arena",
     "Eight short questions on waste, water, road safety, tree care and good reporting habits.", 100, 5),
]

# (code, title, description, secret, criteria, sort_order)
ACHIEVEMENTS = [
    ("civic_observer", "Civic Observer", "Reach 1 verified contribution.", False, {"verified_contributions": 1}, 10),
    ("neighbourhood_helper", "Neighbourhood Helper", "Reach 5 verified contributions.", False, {"verified_contributions": 5}, 20),
    ("community_guardian", "Community Guardian", "Reach 15 verified contributions.", False, {"verified_contributions": 15}, 30),
    ("civic_champion", "Civic Champion", "Reach 30 verified contributions.", False, {"verified_contributions": 30}, 40),
    ("city_ambassador", "City Ambassador", "Reach 50 verified contributions.", False, {"verified_contributions": 50}, 50),
    ("quiz_whiz", "Quiz Whiz", "Score 80 or more in the Civic Quiz Arena.", False, {"game": "civic_quiz", "min_score": 80}, 60),
    ("tidy_citizen", "Tidy Citizen", "Score 80 or more in the Clean City Challenge.", False, {"game": "clean_city", "min_score": 80}, 70),
    ("first_voice", "First Voice", "Your first verified report that was submitted by voice.", True, {"submitted_via": "voice"}, 110),
    ("water_guardian", "Water Guardian", "A verified water-related contribution.", True, {"category": "water"}, 120),
    ("night_owl", "Night Owl", "A verified streetlight issue reported after dark (19:00 to 05:00 IST).", True,
     {"category": "electricity", "subcategory": "broken_streetlight", "reported_between_ist": ["19:00", "05:00"]}, 130),
    ("clean_sweep", "Clean Sweep", "A verified sanitation or waste contribution.", True, {"category": "waste"}, 140),
    ("neighbourhood_watch", "Neighbourhood Watch", "Useful supporting evidence added to an existing report that was verified.", True,
     {"supporting_evidence": True}, 150),
    ("golden_tree", "Golden Tree", "Complete the weekly civic challenge by finishing both games in one week.", True,
     {"weekly_challenge": True}, 160),
]


def seed(db: Session) -> None:
    for code, title, desc, max_score, daily in GAMES:
        g = db.get(Game, code)
        if g is None:
            db.add(Game(code=code, title=title, description=desc, max_score=max_score, daily_points=daily, active=True))
        else:  # keep admin-tuned daily_points / active; refresh text only
            g.title, g.description = title, desc
    for code, title, desc, secret, criteria, order in ACHIEVEMENTS:
        a = db.get(Achievement, code)
        if a is None:
            db.add(Achievement(code=code, title=title, description=desc, secret=secret, criteria=criteria, sort_order=order))
        else:
            a.title, a.description, a.secret, a.criteria, a.sort_order = title, desc, secret, criteria, order
    db.commit()
