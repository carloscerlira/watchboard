# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- TD-001: Consolidated `tierClass`/`tierLabel` from 5 duplicated definitions into single canonical source in `tier-utils.ts`; added `tierLabelFull` and `tierLabelShort` variants; consumer files now import or re-export from the canonical module
- TD-002: Wired up orphaned `constants.ts` — `Header.astro` now imports `NAV_SECTIONS` and `MilitaryTabs.tsx` now imports `MIL_TABS` from `src/lib/constants.ts`; removed inline redefinitions
- TD-009: Replaced hard-coded "Feb 28 -- Mar 4" date range in MilitaryTabs with `computeDateRange()` that dynamically derives min/max dates from strike and retaliation `time` fields
- TD-017: Normalized `dateToDay()` and `formatDate()` in CesiumTimelineBar to use explicit UTC, preventing off-by-one date on slider scrub for UTC+ timezone users
- TD-022: Extracted magic number `43200000` (noon offset) in CesiumGlobe to named constant `NOON_OFFSET_MS`
- TD-006: Removed dead `dotColor` field from `MapCategory` interface and all `MAP_CATEGORIES` entries in `map-utils.ts`
- TD-007: Replaced hard-coded `majorLabels` ID set in LeafletMap with data-driven `showLabel` boolean on MapPointSchema; 10 key points now have `showLabel: true` in `map-points.json`
- TD-008: Replaced hard-coded Hormuz zone radius (`pt.id === 'hormuz' ? 60000 : 40000`) with data-driven `zoneRadius` field on MapPointSchema; both 2D LeafletMap and 3D Cesium globe use `pt.zoneRadius ?? 40000`
- TD-010: Confirmed `attributionControl={false}` was already removed in prior refactor; Carto attribution renders correctly with existing dark-theme CSS overrides
- TD-023: Extracted duplicated sine-curve arc geometry into shared `computeArcPositions()` and `interpolateArcPosition()` functions in `map-helpers.ts`; both LeafletMap and MapArcAnimator now import from the shared module
- TD-018, TD-019, TD-020, TD-021: Verified already resolved in prior sessions; moved to resolved in TECH_DEBT.md
- TD-005: Replaced `set:html` with safe text interpolation in Hero.astro to eliminate XSS risk from AI-generated headline
- TD-003: Added early return guard in `generateSparkline()` for arrays with fewer than 2 elements, preventing NaN SVG coordinates
- TD-011: Added `.env`, `.env.local`, `.env.*.local` to `.gitignore` to prevent accidental credential commits
- TD-012: Added `.min(2)` constraint on `EconItemSchema.sparkData` to reject invalid sparkline data at schema validation time
- TD-004: Deploy workflow no longer fires on failed nightly updates — added JSON validation gate in update-data.yml and `workflow_run.conclusion == 'success'` condition in deploy.yml
- TD-013: JSON writes in update script are now atomic (write-to-temp-then-rename) via `atomicWriteFile` helper, preventing corrupt data files on mid-write crashes

### Added
- 2D IntelMap overlay layers: No-Fly Zones (6 zones), GPS Jamming (6 zones with hex rendering), Internet Blackouts (5 zones), USGS Earthquakes (live fetch), Weather (Open-Meteo archive API with cloud cover and wind)
- MapLayerToggles: collapsible overlay layer panel with per-layer toggle, colored indicators, and active count badges
- useMapOverlays hook: date-filtered zone computation, USGS earthquake API fetching, Open-Meteo weather fetching, overlay counts
- MapOverlayData: shared data constants for all 5 overlay types with hexagonLatLngs geometry helper
- LeafletMap now renders Polygon overlays for no-fly zones, GPS jamming hexagons, internet blackout zones; CircleMarker for earthquakes; Circle for weather cloud cover
- Enhanced 2D IntelMap timeline with multi-speed playback (1x/2x/5x/10x/Auto), prev/next event navigation, event tick marks, LIVE button, and event count badge
- MapEventsPanel: right-side intel feed panel for the 2D map with expandable event cards, weapon-type badges, confidence indicators, source chips with tier and pole labels
- OSINT-enhanced line rendering in LeafletMap: weapon-type-aware line weights, low-confidence opacity, intercepted dash pattern, and rich multi-line tooltips
- Map stats overlay showing filtered location and vector counts
- WEAPON_TYPE_WEIGHTS, WEAPON_TYPE_LABELS, STATUS_LABELS exports in map-helpers.ts
- Timeline events passed from index.astro to IntelMap via flattenTimelineEvents
- Live flight tracking (useMapFlights): OpenSky Network API polling with 15s interval, military callsign detection, exponential backoff on 429/errors, active only at latest date
- Day/night terminator (useTerminator): solar declination math, night polygon rendered behind all layers via Leaflet Pane (zIndex 200), synced to noon of simulated date
- Animated strike arcs (MapArcAnimator): glowing dot projectiles animate along arc paths during playback, max 8 simultaneous, looping 2s animation, red for strikes, amber for retaliation
- Persist toggle (DAY/ALL): timeline button to switch between showing only current-day lines vs all lines up to current date
- LayerState expanded to 7 toggles: added flights (color #00aaff, icon airplane) and terminator (color #4488aa, icon half-circle)
- Flight rendering: CircleMarkers with military=yellow/radius 5, civilian=cyan/radius 3, tooltip with callsign/country/altitude/speed
- Flight count in map stats overlay
- OSINT weapon-type schemas: `WeaponTypeSchema`, `ConfidenceSchema`, `StrikeStatusSchema` with inferred types
- 10 optional OSINT fields on `MapLineSchema`: weaponType, launched, intercepted, confidence, time, damage, casualties, notes, platform, status
- 2 optional OSINT fields on `TimelineEventSchema`: weaponTypes, confidence
- 5 weapon-type-aware rendering helpers in cesium-helpers.ts: `weaponSpeed`, `weaponPeakAlt`, `simFlightDurationTyped`, `weaponProjectileSize`, `weaponGlowPower`

## [1.0.0] - 2026-03-07

### Added
- Astro 5 static intelligence dashboard with dark theme
- 7-section single-page layout: Timeline, Map, Military Ops, Humanitarian, Economic, Contested Claims, Political
- Interactive SVG theater map with category filters, arc lines, and click-to-detail info panel
- Click-to-expand historical timeline spanning 1941 to present
- Tabbed military operations view (strike targets, retaliation, US assets)
- Economic impact cards with sparkline charts (Brent, WTI, gold, S&P 500, VIX, rial)
- Contested claims matrix with side-by-side source comparison
- 4-tier source classification system (Official, Major Outlet, Institutional, Unverified)
- Casualty table with contested/verified badges
- Political and diplomatic statements grid
- KPI strip with contested flags and color coding
- 3D CesiumJS intelligence globe at `/globe` route
- Animated missile trajectories with synchronized timeline on globe
- Post-processing shaders (CRT, NVG, Thermal, Bloom) on globe
- Real-time satellite tracking, flight tracking, and earthquake feeds on globe
- Events/intel feed panel on globe synced to timeline date
- Nightly AI data update pipeline with dual provider support (Anthropic / OpenAI)
- Multi-pole sourcing (Western, Middle Eastern, Eastern, International perspectives)
- Zod schema validation for all data at build time
- Daily event partitioning with backfill infrastructure (`npm run backfill`)
- GitHub Actions CI/CD: auto-deploy on push + scheduled nightly data refresh
- Full data backfill covering all 44 days (Jan 23 - Mar 7, 2026)
