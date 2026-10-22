---
title: "Publish the site on GitHub Pages"
labels: [infra]
---
- Enable Pages (source: GitHub Actions) in the repo settings; `.github/workflows/pages.yml` builds `site/` on push to `main`.
- Check the site at `https://<owner>.github.io/jacobs-city-lens/`.
- Later: switch hexagon GeoJSON to PMTiles when cities get bigger.
