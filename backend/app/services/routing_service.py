"""Category (+subcategory) -> department / agency, from the editable `authority_routing_rules` table.
The most specific active rule wins (subcategory match beats category-only), then the category's default department.
This is a STARTING rule set; final assignment must also check boundaries and real asset ownership."""
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Department, RoutingRule

TRIAGE_DEPARTMENT = "municipal_triage"


@dataclass
class RouteDecision:
    department_code: Optional[str]
    agency_kind: Optional[str]          # corporation | bwssb | bescom
    requires_human_review: bool = False
    min_severity: Optional[str] = None
    note: Optional[str] = None
    rule_id: Optional[int] = None       # optional extras (INTAKE may ignore them)
    source: Optional[str] = None        # subcategory_rule | category_rule | category_default | fallback


def _agency_kind_for(db: Session, department_code: Optional[str], default: str = "corporation") -> str:
    dept = db.get(Department, department_code) if department_code else None
    return dept.agency_kind if dept is not None and dept.agency_kind else default


def resolve_route(db: Session, category: str, subcategory: Optional[str] = None) -> RouteDecision:
    rules = list(db.scalars(
        select(RoutingRule).where(RoutingRule.category == category, RoutingRule.active.is_(True))
        .order_by(RoutingRule.effective_from.desc(), RoutingRule.id.desc())
    ))
    chosen: Optional[RoutingRule] = None
    source = "category_rule"
    if subcategory:
        chosen = next((r for r in rules if r.subcategory == subcategory), None)
        if chosen is not None:
            source = "subcategory_rule"
    if chosen is None:
        chosen = next((r for r in rules if not r.subcategory), None)
    if chosen is not None:
        return RouteDecision(chosen.department_code, chosen.agency_kind or _agency_kind_for(db, chosen.department_code),
                             bool(chosen.requires_human_review), chosen.min_severity, chosen.note, chosen.id, source)

    cat = db.get(Category, category)
    if cat is not None and cat.default_department_code:
        return RouteDecision(cat.default_department_code, _agency_kind_for(db, cat.default_department_code), False,
                             None, "No active routing rule - using the category's default department.", None,
                             "category_default")
    return RouteDecision(TRIAGE_DEPARTMENT, _agency_kind_for(db, TRIAGE_DEPARTMENT), True, None,
                         "Unknown category - routed to the municipal triage queue for manual routing.", None, "fallback")
