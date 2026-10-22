# Jacobs City Lens

Visualizing the ideas of Jane Jacobs' *The Death and Life of Great American Cities*
(1961) with open data: mixed uses, short blocks, aged buildings, density, eyes on the
street and border vacuums. It covers the cities in the book (New York, Boston,
Chicago, Philadelphia, San Francisco) plus Rotterdam and Hanoi.

See [PLAN.md](PLAN.md) for the indicators, data sources, cities and phases.

## Layout

```
config/      city and neighbourhood definitions
pipeline/    data ingest and metric computation (Python)
data/        raw and processed data (not committed)
notebooks/   exploration
site/        the website (MapLibre + D3)
docs/        notes on methods and sources
```
