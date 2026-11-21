"""CivicVerse games. Answers and scoring live on the server; the client only ever sees prompts."""
import random
from datetime import timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CivicPointsLedger, Game, GameSession
from app.models.base import utcnow
from app.services import achievement_service, points_service
from app.services.quiz_bank import QUIZ_BANK

BINS = [("wet", "Wet waste"), ("dry", "Dry waste"), ("recyclable", "Recyclable"),
        ("e_waste", "E-waste"), ("hazardous", "Hazardous")]
BIN_CODES = {b for b, _ in BINS}

CLEAN_CITY_ITEMS_PER_GAME = 12
QUIZ_QUESTIONS_PER_GAME = 8
MIN_CLIENT_DURATION_SECONDS = 3.0
MIN_SERVER_ELAPSED_SECONDS = 2.0  # server-measured time between session start and submit

# (name, bin) - plain, uncontroversial everyday classifications
CLEAN_CITY_ITEMS = [
    ("Banana peel", "wet"), ("Vegetable scraps", "wet"), ("Leftover cooked rice", "wet"), ("Used tea leaves", "wet"),
    ("Eggshells", "wet"), ("Fruit peels", "wet"), ("Coffee grounds", "wet"), ("Wilted flowers", "wet"),
    ("Snack packet wrapper", "dry"), ("Broken ceramic cup", "dry"), ("Torn cloth rag", "dry"),
    ("Thermocol packing tray", "dry"), ("Worn-out sock", "dry"), ("Rubber band", "dry"), ("Old toothbrush", "dry"),
    ("Clean cardboard box", "recyclable"), ("Old newspaper", "recyclable"), ("Empty glass bottle", "recyclable"),
    ("Rinsed steel tin", "recyclable"), ("Rinsed plastic water bottle", "recyclable"), ("Office paper", "recyclable"),
    ("Magazine", "recyclable"), ("Rinsed glass jar", "recyclable"), ("Empty aluminium can", "recyclable"),
    ("Old mobile phone", "e_waste"), ("Tangled charger cable", "e_waste"), ("Broken earphones", "e_waste"),
    ("Old computer mouse", "e_waste"), ("TV remote control", "e_waste"), ("Dead laptop", "e_waste"),
    ("Leftover paint tin", "hazardous"), ("Empty pesticide bottle", "hazardous"), ("Broken mercury thermometer", "hazardous"),
    ("Strong bathroom-cleaner bottle", "hazardous"), ("Insect-spray aerosol can", "hazardous"),
    ("Expired medicine strips", "hazardous"),
]
assert len(CLEAN_CITY_ITEMS) >= 30


class GameError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


# ---------------------------------------------------------------- session creation
def _pick_clean_city(rng: random.Random):
    by_bin: Dict[str, list] = {}
    for name, b in CLEAN_CITY_ITEMS:
        by_bin.setdefault(b, []).append((name, b))
    chosen = []
    for b in BIN_CODES:
        chosen.extend(rng.sample(by_bin[b], 2))
    rest = [i for i in CLEAN_CITY_ITEMS if i not in chosen]
    chosen.extend(rng.sample(rest, CLEAN_CITY_ITEMS_PER_GAME - len(chosen)))
    rng.shuffle(chosen)
    return chosen


def start_session(db: Session, user_id: str, game_code: str) -> Dict[str, Any]:
    game = db.get(Game, game_code)
    if not game or not game.active:
        raise GameError(404, "Unknown game")
    rng = random.Random()
    if game_code == "clean_city":
        items = _pick_clean_city(rng)
        answers = {f"i{n}": {"name": name, "bin": b} for n, (name, b) in enumerate(items, 1)}
        payload = {"kind": "clean_city", "answers": answers}
        config = {
            "items": [{"id": k, "name": v["name"], "emoji_free_label": v["name"]} for k, v in answers.items()],
            "bins": [{"code": c, "label": lbl} for c, lbl in BINS],
            "total": len(answers),
        }
    elif game_code == "civic_quiz":
        picked = rng.sample(QUIZ_BANK, QUIZ_QUESTIONS_PER_GAME)
        answers, questions = {}, []
        for n, q in enumerate(picked, 1):
            order = list(range(4))
            rng.shuffle(order)
            options = [q["options"][i] for i in order]
            answers[f"q{n}"] = {"answer": order.index(q["answer"]), "explanation": q["explanation"]}
            questions.append({"id": f"q{n}", "text": q["text"], "options": options})
        payload = {"kind": "civic_quiz", "answers": answers}
        config = {"questions": questions, "total": len(questions)}
    else:
        raise GameError(404, "Unknown game")
    sess = GameSession(user_id=user_id, game_code=game_code, seed=f"{rng.random():.12f}"[2:], payload=payload)
    db.add(sess)
    db.flush()
    return {"session_id": sess.id, "game_code": game_code, "config": config}


# ---------------------------------------------------------------- scoring
def _normalise_answers(raw: Any, ids: List[str]) -> Dict[str, Any]:
    """Accept {id: value}, [{id, answer|bin|option}], or a plain list in presented order."""
    out: Dict[str, Any] = {}
    if isinstance(raw, dict):
        return {str(k): v for k, v in raw.items()}
    if isinstance(raw, list):
        for pos, a in enumerate(raw):
            if isinstance(a, dict):
                key = a.get("id", a.get("item_id", a.get("question_id")))
                val = a.get("answer", a.get("bin", a.get("option", a.get("choice"))))
                if key is not None:
                    out[str(key)] = val
            elif pos < len(ids):
                out[ids[pos]] = a
    return out


def _grade(payload: dict, raw_answers: Any) -> Dict[str, Any]:
    answers = payload["answers"]
    given = _normalise_answers(raw_answers, list(answers.keys()))
    kind = payload["kind"]
    review, correct = [], 0
    for qid, truth in answers.items():
        value = given.get(qid)
        if kind == "clean_city":
            ok = isinstance(value, str) and value == truth["bin"]
            expl = f"{truth['name']} belongs in the {dict(BINS)[truth['bin']].lower()} bin."
        else:
            ok = isinstance(value, int) and not isinstance(value, bool) and value == truth["answer"]
            expl = truth["explanation"]
        correct += 1 if ok else 0
        review.append({"id": qid, "correct": ok, "explanation": expl})
    return {"correct": correct, "total": len(answers), "review": review}


def _award_for_completion(db: Session, user_id: str, game: Game, sess: GameSession) -> Dict[str, Any]:
    db.flush()  # sessions may be created with autoflush off; make this completion visible to the queries below
    pts = points_service.get_points_settings(db)
    today = points_service.ist_date()
    awarded = 0
    cap_reached = False

    daily = game.daily_points if game.daily_points is not None else pts["game_daily"]
    remaining = points_service.daily_game_cap_remaining(db, user_id)
    already = db.scalars(select(CivicPointsLedger.id).where(
        CivicPointsLedger.user_id == user_id, CivicPointsLedger.reason_code == "game_daily",
        CivicPointsLedger.ref_type == "game_daily", CivicPointsLedger.ref_id == f"{game.code}:{today.isoformat()}")).first()
    if already is None:
        grant = min(daily, remaining)
        if grant < daily:
            cap_reached = True
        if grant > 0:
            row = points_service.award(db, user_id, "game_daily", grant, "game_daily",
                                       f"{game.code}:{today.isoformat()}", f"Daily game: {game.title}")
            awarded += row.points if row else 0
    elif remaining <= 0:
        cap_reached = True

    # weekly challenge: both games completed within the same ISO week (IST)
    iso = today.isocalendar()
    week_key = f"{iso[0]}-W{iso[1]:02d}"
    monday = today - timedelta(days=today.weekday())
    start, _ = points_service.ist_day_bounds_utc(monday)
    _, end = points_service.ist_day_bounds_utc(monday + timedelta(days=6))
    played = set(db.scalars(select(GameSession.game_code).where(
        GameSession.user_id == user_id, GameSession.completed_at.isnot(None),
        GameSession.completed_at >= start, GameSession.completed_at < end)))
    weekly = False
    active_games = set(db.scalars(select(Game.code).where(Game.active.is_(True))))
    if active_games and active_games <= played:
        row = points_service.award(db, user_id, "game_weekly", pts["game_weekly"], "game_weekly", week_key,
                                   "Weekly civic challenge completed")
        if row:
            awarded += row.points
            weekly = True
    return {"points": awarded, "cap_reached": cap_reached, "weekly": weekly}


def submit_score(db: Session, user_id: str, session_id: int, answers: Any, duration_seconds: Optional[float]) -> Dict[str, Any]:
    sess = db.get(GameSession, session_id)
    if sess is None or sess.user_id != user_id:
        raise GameError(404, "Game session not found")  # same answer for 'missing' and 'not yours'
    if sess.completed_at is not None:
        raise GameError(409, "This game session was already completed")
    if duration_seconds is None or duration_seconds < MIN_CLIENT_DURATION_SECONDS:
        raise GameError(400, "That was too fast to be a real attempt. Please play the game through.")
    if (utcnow() - sess.started_at).total_seconds() < MIN_SERVER_ELAPSED_SECONDS:
        raise GameError(400, "That was too fast to be a real attempt. Please play the game through.")
    game = db.get(Game, sess.game_code)
    if game is None or not sess.payload:
        raise GameError(404, "Unknown game")

    graded = _grade(sess.payload, answers)
    max_score = game.max_score or 100
    score = round(graded["correct"] * max_score / max(1, graded["total"]))
    sess.validated_score = score
    sess.completed_at = utcnow()
    result = _award_for_completion(db, user_id, game, sess)
    sess.points_awarded = result["points"]
    db.flush()
    unlocked = achievement_service.evaluate(db, user_id)
    return {
        "score": score, "max_score": max_score, "correct": graded["correct"], "total": graded["total"],
        "points_awarded": result["points"], "daily_cap_reached": result["cap_reached"],
        "weekly_challenge_completed": result["weekly"],
        "review": graded["review"], "achievements_unlocked": unlocked,
    }


# ---------------------------------------------------------------- listing
def list_games(db: Session, user_id: str) -> List[Dict[str, Any]]:
    start, end = points_service.ist_day_bounds_utc()
    out = []
    for g in db.scalars(select(Game).where(Game.active.is_(True)).order_by(Game.code)):
        sessions = list(db.scalars(select(GameSession).where(
            GameSession.user_id == user_id, GameSession.game_code == g.code, GameSession.completed_at.isnot(None))))
        played_today = any(start <= s.completed_at < end for s in sessions)
        best = max([s.validated_score for s in sessions if s.validated_score is not None] or [None]) if sessions else None
        out.append({"code": g.code, "title": g.title, "description": g.description, "max_score": g.max_score,
                    "daily_points": g.daily_points, "played_today": played_today, "best_score": best})
    return out
