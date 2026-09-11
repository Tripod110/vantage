# Vantage — Match Desk

An independent implementation of the Vantage product brief. All HTML, CSS, application logic, and analysis were written from scratch. No original application source was copied or modified.

## Run

From `dist`, run `python -m http.server 5187` and open `http://localhost:5187`.

The initial view uses explicitly labeled illustrative data. Connect a numeric Steam account ID or SteamID64 to load real matches directly from Deadlock API. No API key, framework, build step, or backend is needed. Hero and rank catalogs come from Deadlock API; fonts come from Google Fonts.

## Behavior

- The most recent 20 available history entries are retained. Accounts with fewer matches show only what is available. Failed metadata keeps its summary slot and is retried only on a later manual refresh.
- Metadata is fetched only for new or incomplete matches, with at most four requests in flight. A complete unchanged cache makes no metadata requests. There is no polling or automatic retry loop.
- Storage is device-local under `vantage:desk:`. Switching accounts preserves each account's cached window and clears the previous account's visible identity and rank context.
- Reviews exclude the selected match from baselines even when ID types differ. Coaching comparisons use the same known game mode and need at least five usable peer matches. Smaller baselines and missing selected-match measurements are explained separately, while available measurements remain visible in deep review.
- The match focus can present at most one measured gap and one grounded next-game suggestion. Timestamped observations describe recorded events without assigning causes. Team damage share is descriptive context only and never drives advice or favorable/unfavorable styling.
- Short matches cannot claim nominal 10- or 12-minute metrics. Death-derived observations require complete records that agree with the summary count. Cross-player metrics require complete teams and aligned snapshots.
- The economy chart keeps the reviewed match's real curve. It hides the comparison legend when no baseline points exist; when a mean is shown, later timestamps may have fewer contributing games.
- Version 1 compact caches migrate without refetching complete matches. Locally reconstructable values and recorded series remain available, while unverifiable legacy lobby and team-damage comparisons remain unavailable until newer games replace them naturally.
- Rank history is limited to games in the current window. Hero and rank catalogs have a seven-day device-local cache, and rank names are never hard-coded.

## Validation and limits

`node --check` passes for both JavaScript files, and the 14-test Node suite covers saved-response extraction, short and malformed data, aligned team snapshots, windowing and eviction, mixed-type IDs, self-exclusion, sample thresholds, game modes, comparison wording, migration, cache reuse, request concurrency, retryable failures, and rate-limit stopping.

Local fixture browser QA covers desktop and phone layouts, match focus and deep review, teaching mode, keyboard selection focus, zero-peer messaging and chart presentation, saved-window recovery after a failed refresh, contained table scrolling, page overflow, and console errors. A fresh live-account request was not performed, so production behavior still depends on Deadlock API availability, response compatibility, CORS, and image hosting. See `AUDIT.md` for the release evidence.
