"""A deliberately partial parser for the OSM `opening_hours` syntax.

The full specification covers public holidays, month and week ranges, variable
dates and sunset offsets. Modelling all of that would not make the time-of-day
mix any truer, so this parser handles the common forms and *refuses* the rest,
returning None, so the share of values it could not read can be reported
alongside the result rather than silently treated as closed.

What is supported:

* ``24/7``
* rule lists separated by ``;``, applied in order so later rules win
* weekday selectors: ``Mo``, ``Mo-Fr``, ``Mo,We,Fr``, ``Mo-Sa,Su``
* time selectors: ``09:00-18:00``, several separated by commas,
  ``00:00-24:00``, and ranges crossing midnight such as ``20:00-02:00``
* ``off`` / ``closed``, which clears the days of its rule
* ``PH`` / ``SH``, skipped rather than rejected, whether a whole rule or one
  entry in a weekday list
* rules separated by ``,`` instead of ``;``, as in ``Mo-Sa 09:30-20:00, Su 14:00-20:00``
* trailing quoted comments such as ``"opening hours of Albert Heijn"``

Anything else — month or week selectors, ``sunrise``/``sunset``, nth-weekday
brackets, free text — makes the whole value unparseable.
"""

from __future__ import annotations

import re

import numpy as np

DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
DAY_INDEX = {day: i for i, day in enumerate(DAYS)}
HOURS = 24

_UNSUPPORTED = re.compile(
    r"""(?:
        \b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b
      | \bweek\b | \beaster\b
      | \bsunrise\b | \bsunset\b | \bdawn\b | \bdusk\b
      | [\[\]<>] | \d{4}
    )""",
    re.IGNORECASE | re.VERBOSE,
)
_DAY_SELECTOR = re.compile(
    r"^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?"
    r"(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\b",
    re.IGNORECASE,
)
_TIME_RANGE = re.compile(r"^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$")
_HOLIDAY = re.compile(r"\b(?:PH|SH)\b", re.IGNORECASE)
_COMMENT = re.compile(r'"[^"]*"')
# A comma starts a new rule when a weekday follows it ("Mo-Sa 09:00-20:00,
# Su 14:00-20:00"), but not when it separates time ranges
# ("09:00-12:00,13:00-17:00") or weekdays within one list ("Sa,Su 10:00-16:00").
_RULE_SPLIT = re.compile(
    r";|(?<!Mo)(?<!Tu)(?<!We)(?<!Th)(?<!Fr)(?<!Sa)(?<!Su),(?=\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)\b)",
    re.IGNORECASE,
)
# PH or SH listed among weekdays ("Mo-Su,PH 06:00-24:00").
_HOLIDAY_IN_LIST = re.compile(r"\s*,\s*(?:PH|SH)\b|\b(?:PH|SH)\s*,\s*", re.IGNORECASE)


def _canonical_day(token: str) -> int:
    return DAY_INDEX[token.strip().capitalize()[:2].title()]


def _days_of(selector: str) -> list[int]:
    days: list[int] = []
    for part in selector.split(","):
        part = part.strip()
        if "-" in part:
            start, end = (_canonical_day(p) for p in part.split("-", 1))
            # Mo-Su and Sa-Mo both make sense; wrap around the week.
            days.extend([(start + i) % 7 for i in range((end - start) % 7 + 1)])
        else:
            days.append(_canonical_day(part))
    return sorted(set(days))


def _apply_range(mask: np.ndarray, days: list[int], text: str) -> bool:
    match = _TIME_RANGE.match(text.strip())
    if not match:
        return False
    sh, sm, eh, em = (int(g) for g in match.groups())
    start = sh * 60 + sm
    end = eh * 60 + em
    if not (0 <= start <= 24 * 60 and 0 <= end <= 24 * 60):
        return False
    if end == start:
        return False
    for day in days:
        if end > start:
            _fill(mask, day, start, end)
        else:
            # Crosses midnight: the tail belongs to the following day.
            _fill(mask, day, start, 24 * 60)
            _fill(mask, (day + 1) % 7, 0, end)
    return True


def _fill(mask: np.ndarray, day: int, start_min: int, end_min: int) -> None:
    """Mark every hour the interval touches, so 09:30-10:15 covers 09 and 10."""
    first = start_min // 60
    last = (end_min - 1) // 60
    mask[day, first:last + 1] = True


def week_mask(value: str | None) -> np.ndarray | None:
    """A 7x24 boolean array of open hours, or None if the value is not supported."""
    if not value or not isinstance(value, str):
        return None
    text = _COMMENT.sub("", value).strip()
    if not text or _UNSUPPORTED.search(text):
        return None
    if text.replace(" ", "") == "24/7":
        return np.ones((7, HOURS), dtype=bool)

    text = _HOLIDAY_IN_LIST.sub("", text)
    mask = np.zeros((7, HOURS), dtype=bool)
    understood = False
    for rule in _RULE_SPLIT.split(text):
        rule = rule.strip().rstrip(",")
        if not rule:
            continue
        if _HOLIDAY.search(rule):
            continue  # public and school holidays are not modelled
        match = _DAY_SELECTOR.match(rule)
        if match:
            days = _days_of(match.group(1))
            rest = rule[match.end():].strip()
        else:
            days = list(range(7))
            rest = rule
        if not rest:
            return None  # a bare weekday list says nothing about hours
        if rest.lower() in ("off", "closed"):
            mask[days, :] = False
            understood = True
            continue
        if rest.replace(" ", "") == "24/7":
            mask[days, :] = True
            understood = True
            continue
        mask[days, :] = False  # a later rule replaces the hours for its days
        for part in rest.split(","):
            if not _apply_range(mask, days, part):
                return None
            understood = True
    return mask if understood else None
