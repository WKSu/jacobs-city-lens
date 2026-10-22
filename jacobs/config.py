"""Load city definitions from config/cities/<id>.yaml."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config" / "cities"
DATA_DIR = ROOT / "data"


@dataclass
class City:
    id: str
    name: str
    country: str
    crs: str
    h3_resolution: int
    boundary: dict
    sources: dict
    study_areas: dict = field(default_factory=dict)
    # Rotterdam scenes and places to look at, told in each tab before the indicators.
    story: dict = field(default_factory=dict)

    @property
    def raw_dir(self) -> Path:
        return DATA_DIR / "raw" / self.id

    @property
    def processed_dir(self) -> Path:
        return DATA_DIR / "processed" / self.id

    def source_config(self, name: str) -> dict:
        return self.sources.get(name) or {}


def load_city(city_id: str) -> City:
    path = CONFIG_DIR / f"{city_id}.yaml"
    if not path.exists():
        known = ", ".join(sorted(p.stem for p in CONFIG_DIR.glob("*.yaml")))
        raise SystemExit(f"Unknown city '{city_id}'. Known cities: {known}")
    with path.open() as f:
        return City(**yaml.safe_load(f))


def list_cities() -> list[str]:
    return sorted(p.stem for p in CONFIG_DIR.glob("*.yaml"))
