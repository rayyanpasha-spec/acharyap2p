from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import AuditLog


def log(db: Session, actor, action: str, entity_type: str, entity_id: Any = None,
        before: Optional[dict] = None, after: Optional[dict] = None, reason: Optional[str] = None) -> AuditLog:
    """Append an immutable audit row (caller commits). `actor` is a CurrentUser or None (system)."""
    row = AuditLog(
        actor_user_id=getattr(actor, "id", None), actor_role=getattr(actor, "role", None),
        action=action, entity_type=entity_type, entity_id=str(entity_id) if entity_id is not None else None,
        before=before, after=after, reason=reason,
    )
    db.add(row)
    return row
