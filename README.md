# Vantage — Match Desk

An independent implementation of the Vantage product brief. All HTML, CSS, application logic, and analysis were written from scratch. No original application source was copied or modified.

## Run

From `dist`, run `python -m http.server 5187` and open `http://localhost:5187`.

The initial view uses explicitly labeled illustrative data. Connect a numeric Steam account ID or SteamID64 to load real matches directly from Deadlock API. No API key, framework, build step, or backend is needed. Hero images and catalogs come from Deadlock API; fonts come from Google Fonts.

## Behavior

- Exactly the most recent 20 available history entries are retained. Accounts with fewer matches show the available count. Failed metadata keeps a summary slot and can be retried manually.
- Metadata is fetched only for uncached or incomplete matches, with at most four requests in flight. There is no polling.
- Storage is device-local under `vantage:desk:`. Switching accounts preserves cached histories.
- Reviews exclude the selected match from all baselines. Missing metrics remain unavailable. Zero-crossing lobby comparisons use fixed 600-Soul bands.
- The match focus presents one measured gap and one next-game target. Deep review adds the metric table and definitions. Timestamped observations describe recorded events without assigning causes.
- The economy line uses only supported timestamps. Its mean baseline includes other games with data at each timestamp; later points may have fewer contributors.
- Rank history is limited to games in the current window; tier names are fetched from the API. Hero and rank catalogs have a seven-day local cache.

## Validation

JavaScript syntax and local entrypoint were checked. Targeted Node checks cover real metadata extraction, missing fields, Steam IDs, 20-game eviction, baseline self-exclusion, zero-crossing comparisons, interpolation bounds, zero metadata calls on unchanged cache, four-request concurrency, and partial API failures. Browser interaction and visual QA were not requested and were not performed. The optional WebMCP selector is feature-detected; no supported WebMCP validation context was available.

The app depends on third-party API availability, CORS, and image hosting. Unbuilt integrations from the handoff (clip upload, cloud sync, Statlocker, cohort benchmarking, vanity URLs) are outside this version.
