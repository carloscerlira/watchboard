# Watchboard — E2E Test Report

**Date:** 2026-03-21  
**Tools:** Playwright 1.52, Lighthouse 13, custom sub-agents  
**Target:** https://www.artemiop.com/watchboard/

---

## Executive Summary

| Category | Score | Status |
|----------|-------|--------|
| **Functionality** | 184/184 Playwright tests | ✅ All passing |
| **Data Integrity** | 48 trackers, 289 events | ✅ All valid |
| **Performance (Index)** | Lighthouse 67/100 | ⚠️ Needs work |
| **Performance (Tracker)** | Lighthouse 60/100 | ⚠️ Needs work |
| **Accessibility** | Lighthouse 93-95/100 | ✅ Good |
| **Best Practices** | Lighthouse 100/100 | ✅ Perfect |
| **SEO** | Lighthouse 100/100 | ✅ Perfect |
| **Security Headers** | 0/5 present | 🔴 Critical |
| **Encoding** | 4 pages + all RSS feeds | 🔴 Critical |

---

## 🔴 Critical Issues

### 1. Character Encoding Corruption

**4 HTML pages** have broken accented characters in `<title>` and `<meta>` tags:

| Page | Broken | Expected |
|------|--------|----------|
| `calderon-presidency` | Calder�n | Calderón |
| `pena-nieto-presidency` | Pe�a Nieto | Peña Nieto |
| `amlo-presidency` | Andr�s Manuel L�pez Obrador | Andrés Manuel López Obrador |
| `quantum-theory` | Schr�dinger | Schrödinger |

**All 15+ RSS feeds** have worse encoding:
- Em-dash (`—`) renders as `�??` in every feed
- Accented chars: ó → A3, ñ → A±

**Root cause:** Source strings likely Latin-1 encoded but served as UTF-8. The RSS pipeline has a separate (worse) encoding path.

**Fix:** Re-save source data as proper UTF-8. Check RSS generation pipeline for double-encoding.

### 2. Missing Security Headers

All responses are missing **every** recommended security header:

| Header | Status | Risk |
|--------|--------|------|
| `Content-Security-Policy` | ❌ Missing | XSS vulnerability |
| `X-Frame-Options` | ❌ Missing | Clickjacking |
| `X-Content-Type-Options` | ❌ Missing | MIME sniffing |
| `Strict-Transport-Security` | ❌ Missing | Downgrade attacks |
| `Referrer-Policy` | ❌ Missing | Information leakage |

**Fix:** Add headers via GitHub Pages `_headers` file, Cloudflare rules, or a `<meta>` tag for CSP.

### 3. RSS Feed Links Point to Old Domain

All RSS feeds link to `artemiopadilla.github.io` instead of `artemiop.com`.

**Fix:** Update the RSS generation config to use the canonical domain.

---

## ⚠️ Performance Issues

### Lighthouse Scores

| Metric | Index Page | Iran Tracker |
|--------|-----------|--------------|
| **FCP** | 2,058ms | 5,890ms |
| **LCP** | 2,883ms | 8,254ms |
| **TBT** | 1,647ms 🔴 | 128ms |
| **CLS** | 0 ✅ | 0 ✅ |
| **Speed Index** | 2,205ms | — |

### Key Performance Issues

1. **Total Blocking Time: 1,647ms on index** (target: <200ms)
   - Cause: Globe.gl + Three.js initialization blocks the main thread
   - Fix: Lazy-load the globe after sidebar renders, or use `requestIdleCallback`

2. **LCP: 8.2s on tracker pages**
   - Cause: Leaflet map + CesiumGlobe (4.5MB chunk) + large inline data
   - Fix: Code-split the globe, lazy-load below fold

3. **Unused CSS: ~50% of CSS is unused on any given page**
   - Fix: PurgeCSS or split per-page CSS

4. **Unused JavaScript: ~50% unused**
   - Fix: Tree-shake, split globe/map code from data sections

5. **Render-blocking resources**
   - Fix: Inline critical CSS, defer non-critical scripts

### Page Weight Breakdown (Index)

| Resource Type | Files | Size |
|--------------|-------|------|
| HTML | 2 | 33 KB |
| CSS | 1 | 13 KB |
| Fonts (woff2) | 2 | 118 KB |
| JavaScript | 8 | 575 KB |
| JSON (data) | 1 | 8 KB |
| Images (PNG) | 1 | 369 KB |
| Images (JPEG) | 1 | 698 KB |
| **Total** | **16** | **~1.8 MB** |

The globe textures (earth-dark.jpg 698KB + earth-topology.png 369KB) account for 59% of page weight.

**Fix:** Compress globe textures to WebP/AVIF, or lazy-load them after initial render.

---

## ✅ What's Working Well

### Playwright Test Results (184 tests)

| Suite | Tests | Status |
|-------|-------|--------|
| Command Center (Index) | 12 | ✅ All pass |
| Live Trackers (12 trackers × 6 tests) | 72 | ✅ All pass |
| Historical Trackers (11 trackers × 6 tests) | 66 | ✅ All pass |
| Sub-pages (/about, /globe, /rss.xml) | 12 | ✅ All pass |
| Mobile UX | 5 | ✅ All pass |
| Accessibility | 7 | ✅ All pass |
| API & RSS | 4 | ✅ All pass |
| Security Headers | 2 | ✅ Tests pass (reported missing) |
| Performance Basics | 3 | ✅ All pass |

### Key Findings — All Green

- ✅ **Zero JS errors** across all 23 tracker pages tested
- ✅ **Zero broken images** on any page
- ✅ **Zero encoding issues** in visible body text (only in title/meta)
- ✅ **All images have alt text**
- ✅ **All form inputs have labels**
- ✅ **HTML lang attribute** present
- ✅ **Heading hierarchy** valid (no skipped levels)
- ✅ **No horizontal overflow** on mobile (375px viewport)
- ✅ **Mobile layout** correctly switches to column flex
- ✅ **Search input** functional
- ✅ **Globe canvas** renders
- ✅ **All fonts load** correctly
- ✅ **Gzip compression** enabled
- ✅ **API endpoint** returns valid JSON with 48 trackers
- ✅ **RSS feeds** return valid XML structure

### Data Integrity — All Green

- ✅ 48 tracker configs valid, no duplicate slugs
- ✅ 289 events across 86 files, all valid JSON
- ✅ 9 KPIs valid, contested notes present
- ✅ 130 map points + 135 map lines, all coordinates in range
- ✅ Build succeeds in 18.5s, generates 145 pages
- ✅ Zero TypeScript errors

---

## 📋 Accessibility Details (Lighthouse)

**Score: 93 (index) / 95 (tracker)**

| Audit | Index | Tracker |
|-------|-------|---------|
| ARIA attributes valid | ✅ | ✅ |
| Buttons have names | ✅ | ✅ |
| Color contrast | ✅ | ✅ |
| Document title | ✅ | ✅ |
| HTML lang | ✅ | ✅ |
| Image alt text | ✅ | ✅ |
| Label-content mismatch | — | ❌ Fail |
| Heading order | ✅ | ✅ |
| Meta viewport | ✅ | ✅ |

**Only failing audit:** `label-content-name-mismatch` on tracker page — visible text of some elements doesn't match their accessible name.

---

## 🎯 Recommended Fixes (Priority Order)

### P0 — Fix Now
1. **Encoding: Fix 4 HTML pages** with broken accented characters (Calderón, Peña, López, Schrödinger)
2. **Encoding: Fix RSS pipeline** — em-dash and accent corruption in all feeds
3. **RSS: Update canonical domain** from `artemiopadilla.github.io` to `artemiop.com`

### P1 — This Week
4. **Security headers** — Add CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy
5. **Performance: Lazy-load globe textures** (saves 1MB on initial load)
6. **Performance: Code-split CesiumGlobe** (4.5MB chunk loaded on every page)

### P2 — Next Sprint
7. **Performance: Reduce TBT** — defer globe initialization
8. **Performance: PurgeCSS** — remove 50% unused CSS
9. **Accessibility: Fix label-content mismatch**
10. **Performance: WebP/AVIF globe textures**

### P3 — Nice to Have
11. Add `loading="lazy"` to below-fold images
12. Preload critical fonts with `<link rel="preload">`
13. Add `fetchpriority="high"` to LCP element
14. Implement Brotli compression (currently only gzip)

---

## Test Artifacts

- Playwright tests: `watchboard-tests/tests/*.spec.js`
- Lighthouse reports: `watchboard-tests/lh-index.json`, `watchboard-tests/lh-tracker.json`
- Config: `watchboard-tests/playwright.config.js`

---

*Report generated by automated E2E testing pipeline.*
