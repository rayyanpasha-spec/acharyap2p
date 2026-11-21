"""Import OFFICIAL boundary GeoJSON files into `service_boundaries`.

Run from backend/:
    python scripts/import_boundaries.py                       # every *.geojson in BOUNDARY_DATA_DIR
    python scripts/import_boundaries.py --dir ./data/boundaries --dataset-version gba-2025-09 \
        --source "https://www.bbmp.gov.in/maps/"
    python scripts/import_boundaries.py --file corporations.geojson --level corporation

See backend/data/boundaries/README.md for the expected file names and property names. This script never creates
boundary data; it only loads files you supply.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.database import SessionLocal, init_db  # noqa: E402
from app.services.location_service import load_boundaries_from_dir  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser(description="Import official boundary GeoJSON into service_boundaries")
    p.add_argument("--dir", default=settings.BOUNDARY_DATA_DIR, help="folder with *.geojson files")
    p.add_argument("--level", choices=["service_area", "corporation", "zone", "ward"],
                   help="level for features that carry no `level` property (default: file name if it is a level)")
    p.add_argument("--code", help="code for a single-feature file whose feature has no code property")
    p.add_argument("--dataset-version", help="version label, e.g. gba-2025-09 (default: file name + file date)")
    p.add_argument("--source", help="where the data came from (URL / authority) - stored for audit")
    p.add_argument("--keep-existing", action="store_true", help="do not deactivate previously imported rows")
    args = p.parse_args()

    init_db()
    with SessionLocal() as db:
        summary = load_boundaries_from_dir(db, args.dir, level=args.level, code=args.code,
                                           dataset_version=args.dataset_version, source=args.source,
                                           replace=not args.keep_existing)
    print(f"Directory:       {summary['directory']}")
    print(f"Files read:      {summary['files']}")
    print(f"Features loaded: {summary['imported']}  (by level: {summary['by_level']})")
    print(f"Features skipped:{summary['skipped']}")
    print(f"Dataset version: {summary['dataset_version']}")
    for e in summary["errors"]:
        print("WARNING:", e)
    return 0 if summary["imported"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
