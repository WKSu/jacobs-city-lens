"""Command line entry point: python -m jacobs <command> <city>."""

from __future__ import annotations

import argparse
import importlib

from jacobs.config import list_cities, load_city

# Global tier plus the local tiers, which are only available for some countries
# (see docs/data-sources.md). Each module exposes fetch(city, force=...).
SOURCES = ["overture", "bag", "cbs", "bgt", "osm"]


def main() -> None:
    parser = argparse.ArgumentParser(prog="jacobs", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    fetch = sub.add_parser("fetch", help="download source data for a city")
    fetch.add_argument("city")
    fetch.add_argument("--source", default="overture", choices=SOURCES)
    fetch.add_argument("--layers", nargs="*", help="only these layers (overture)")
    fetch.add_argument("--force", action="store_true", help="re-download even if cached")

    metrics = sub.add_parser("metrics", help="compute all metrics on the H3 grid")
    metrics.add_argument("city")

    export = sub.add_parser("export", help="write web-ready data for the site")
    export.add_argument("city")

    build = sub.add_parser("build", help="metrics + export (after fetch)")
    build.add_argument("city")

    sub.add_parser("cities", help="list configured cities")

    args = parser.parse_args()
    if args.command == "cities":
        print("\n".join(list_cities()))
    elif args.command == "fetch":
        city = load_city(args.city)
        if args.source == "overture":
            from jacobs.sources import overture

            overture.fetch(city, args.layers)
            return
        module = importlib.import_module(f"jacobs.sources.{args.source}")
        module.fetch(city, force=args.force)
    elif args.command == "metrics":
        from jacobs import pipeline

        pipeline.run(load_city(args.city))
    elif args.command == "export":
        from jacobs import export

        export.run(load_city(args.city))
    elif args.command == "build":
        from jacobs import export, pipeline

        city = load_city(args.city)
        pipeline.run(city)
        export.run(city)
