# Vantage release audit

Date: 2026-09-10

## Correctness fixes

- Separated missing selected-match measurements from a too-small comparison baseline. A valid match with 0–4 peers keeps its measured values but receives no coaching suggestion; five usable peers can enable one suggestion.
- Preserved fractional medians, corrected death and match-count grammar, and removed the misleading rounded early-death target.
- Migrated complete version 1 compact caches without metadata refetches while withholding legacy lobby and team-damage values whose cross-player timing cannot be revalidated.
- Hid the chart's baseline legend when it has no baseline points and explained that only the selected match is shown.
- Kept team damage share visually neutral and descriptive, while retaining its numeric difference.
- Kept unknown results out of win/loss totals and gave them neutral match styling.
- Confirmed that a failed refresh retains the saved window, incomplete top-20 slots remain in place and retry later, account identity/rank state is cleared on switch, and an evicted selection falls back to a valid match.

## Automated evidence

- `node --check dist/engine.js` — pass
- `node --check dist/app.js` — pass
- `node --test audit.test.cjs` — 14 tests passed, 0 failed
- `git diff --check` — pass

The tests use reduced local fixtures with account and match identifiers remapped. They cover extraction, timestamps, incomplete data, full-team alignment, window cap/order, mixed ID types, self-exclusion, 0/4/5-peer focus behavior, missing measurements, game modes, fractional death medians, descriptive damage share, interpolation, conservative migration, zero-call cache reuse, four-request concurrency, malformed history, retryable metadata failures, and 429 scheduling stop.

## Browser evidence

Local fixture server only; no live account was submitted.

- 1440×1000: match focus and deep review rendered correctly with teaching mode on and off; no page-level horizontal overflow.
- 390×844: five-column match selector, readable controls, contained metric-table scrolling, and no page-level horizontal overflow.
- Single-match fixture: the gold match curve remained visible, the baseline legend was absent, the page stated that only this match was shown, and the zero-peer focus explained the five-peer requirement while preserving measurements.
- Keyboard activation of the selected match left focus on the rerendered selected button.
- A forced connection failure during manual refresh retained the saved one-match window and showed a recovery message.
- Team damage share had no favorable/unfavorable class. Death and recent-match labels used singular/plural forms correctly.
- Final clean fixture load reported no console errors.

## Release boundary

The existing Site remains owner-only (`custom` access with only the owner) and is still on published version 1. This task updated the local checkout only; it did not commit, push, save a Site version, or deploy because the request did not explicitly authorize publishing an update to the existing Site.

A fresh live-account test remains unverified. Account `186993885` was not sent to `api.deadlock-api.com`; that transmission requires the user's explicit authorization. The app's live integration therefore remains subject to the external API, CORS, and hosted asset availability.
