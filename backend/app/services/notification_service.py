from typing import Optional

from sqlalchemy.orm import Session

from app.models import Notification


def notify(db: Session, user_id: str, type: str, title: str, body: Optional[str] = None,
           complaint_id: Optional[int] = None, ticket_number: Optional[str] = None) -> Notification:
    """Add an in-app notification (caller commits). Never include other citizens' personal data in body."""
    n = Notification(user_id=user_id, type=type, title=title, body=body,
                     complaint_id=complaint_id, ticket_number=ticket_number)
    db.add(n)
    return n
