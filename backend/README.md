# Backend — Urban Mobility Data Explorer

Flask + SQLite API serving the NYC Yellow Taxi trip data (January 2019) to the dashboard.

---

## 1. Quick start

```powershell
# from the repo root
cd backend
python -m venv venv
venv\Scripts\activate          # Mac: source venv/bin/activate
pip install -r requirements.txt
pip install pandas pyarrow     # only needed to build the database

# build the database (one time, takes several minutes)
python database/load_data.py

# start the API
python app.py
```

The API runs at **http://127.0.0.1:3000**. Check it with:

```
http://127.0.0.1:3000/api/health   →   {"status": "ok"}
```

> **Windows tip:** use `127.0.0.1`, not `localhost`. If you get stale 404s after editing, an old server is still running — stop it with `Get-Process python | Stop-Process` and start again.

### Input files

The loader reads the **cleaned** output of the data-cleaning step, not the raw TLC file:

| File | Location |
|---|---|
| `clean_trips.parquet` | `data/output/` |
| `zones.csv` | `data/output/` |

It creates the database at `backend/database/urban_mobility.db`. The `.db` file is **not** committed (see `.gitignore`) — everyone builds it locally with `load_data.py`.

---

## 2. Database design

A **star schema**: one large fact table surrounded by small lookup tables.

```
              vendors
                 │
zones ──── trips (fact, 7,579,062 rows) ──── payment_types
                 │
             rate_codes
```

| Table | Purpose |
|---|---|
| `trips` | One row per taxi trip (7,579,062 rows) |
| `zones` | Taxi zone ID → borough, zone name, service zone (265 rows) |
| `vendors` | Vendor ID → name |
| `payment_types` | Payment type ID → label |
| `rate_codes` | Rate code ID → label |

Besides the original TLC fields, `trips` stores derived columns from the cleaning step: `trip_duration_min`, `avg_speed_mph`, `fare_per_mile`, `tip_pct`, `pickup_hour`, `pickup_weekday`.

**Integrity**

- Foreign keys enforced (`PRAGMA foreign_keys = ON`) from `trips` to every lookup table.
- `CHECK` constraints on the lookup values.
- Vendor ID `4` appears in the data but is not in the TLC data dictionary. Instead of dropping those trips, it is stored as `Unknown (not in TLC data dictionary)` so the foreign key holds and no data is silently lost.

**Indexes**

| Index | Why |
|---|---|
| `pickup_datetime` | date sorting and filtering |
| `pu_location_id` | pickup-zone filter |
| `do_location_id` | drop-off-zone lookups |
| `(pickup_weekday, pickup_hour)` | hour / weekday charts |

### Loading pipeline (`database/load_data.py`)

1. `create_database()` — runs `schema.sql` (drops and recreates all tables).
2. `load_zones()` — loads the 265 zones from `zones.csv`.
3. `load_trips()` — reads `clean_trips.parquet` **in batches of 100,000 rows** with `pyarrow.iter_batches` and inserts with `executemany`, so 7.5M rows never sit in memory at once.
4. `prepare_batch()` fixes each batch to match the table:
   - renames `payment_type` → `payment_type_id`
   - formats datetimes as `YYYY-MM-DD HH:MM:SS` text, which SQLite can sort
   - keeps only the table's columns, in the table's order
   - converts empty values (`NaN`) → `NULL`

---

## 3. API

All endpoints are `GET` and return JSON. CORS is enabled so the dashboard can call them from another port.

### Shared filters

Every data endpoint accepts the same optional filters. Leave one out to mean "no filter".

| Param | Type | Range | Meaning |
|---|---|---|---|
| `borough` | text | — | Pickup borough, e.g. `Manhattan` |
| `zoneId` | int | 1–265 | Pickup zone |
| `hourFrom` | int | 0–23 | Pickup hour, from (inclusive, default 0) |
| `hourTo` | int | 0–23 | Pickup hour, to (inclusive, default 23) |
| `fareMin` | number | ≥ 0 | Fare at least this |
| `fareMax` | number | ≥ 0 | Fare below this |
| `distanceMin` | number | ≥ 0 | Distance (miles) at least this |
| `distanceMax` | number | ≥ 0 | Distance (miles) below this |

Min is inclusive and max is exclusive, so ranges like 10–20 and 20–30 never count the same trip twice.

### Endpoints

| Endpoint | Extra params | Returns |
|---|---|---|
| `/api/health` | — | `{status}` |
| `/api/zones` | — | list of `{id, name, borough}` for all 265 zones |
| `/api/meta` | — | `{isMock, periodStart, periodEnd}` — the date range actually in the data |
| `/api/summary` | filters | `{totalTrips, avgFare, avgDistance, fareMile}` |
| `/api/trips-by-hour` | filters (hour ignored) | `{hourly}` — 24 trip counts, index = hour |
| `/api/fare-by-hour` | filters (hour ignored) | `{fareByHour}` — 24 average fares, index = hour |
| `/api/top-zones` | filters (zoneId ignored), `limit` (default 8) | `{zones}` — each `{zoneId, name, borough, trips, share, avgFare}` |
| `/api/trips` | filters, `page`, `pageSize`, `sortBy`, `sortDir` | `{rows, total, page, totalPages}` |
| `/api/fare-distance` | filters, `maxPoints` (default 2000, max 5000) | `{points, total, model}` — `model` is `{slope, intercept}` |
| `/api/outliers` | filters | `{trips, matched, sampled}` — up to 20,000 trips for the dashboard's Top-K heap |

**`/api/trips` options**

| Param | Default | Allowed |
|---|---|---|
| `page` | 1 | a page past the end returns the last page |
| `pageSize` | 10 | 1–100 |
| `sortBy` | `time` | `time`, `pickupZone`, `dropoffZone`, `duration`, `distance`, `fare`, `fareMile` |
| `sortDir` | `asc` | `asc`, `desc` |

**Why some endpoints ignore a filter:** the hour charts always show all 24 hours (otherwise filtering to 7–9 would leave a chart with 3 bars), and top-zones always shows a ranking (otherwise selecting a zone would leave a list of one).

**Example**

```
GET /api/summary?borough=Manhattan&hourFrom=7&hourTo=9
```

### Errors

Every error uses the same shape:

```json
{ "error": { "code": "BAD_PARAMETER", "message": "hourFrom must be at most 23" } }
```

| Status | Code | When |
|---|---|---|
| 400 | `BAD_PARAMETER` | A filter is not a number, out of range, or `hourFrom > hourTo` |
| 404 | `NOT_FOUND` | Unknown URL |
| 500 | `SERVER_ERROR` | Unexpected failure |

---

## 4. Design decisions

- **SQL injection safety.** Every user value goes into SQL through `?` placeholders. The only part of a query that can't be a placeholder is `ORDER BY`, so `/api/trips` maps `sortBy` to a column through a fixed whitelist (`SORT_COLUMNS`) — anything else falls back to `time`.
- **One filter builder.** `build_filters()` turns the URL params into SQL conditions for every endpoint, so all charts filter the same way. Its `skip` argument lets an endpoint ignore one filter.
- **Validation in one place.** `read_number()` checks type and range for every numeric param and raises `BadParameter`, which one error handler turns into a 400.
- **Nulls last when sorting.** `ORDER BY (col IS NULL), col` keeps missing values at the end of the table in both directions, with `trip_id` as a tie-breaker so pages are stable.
- **Least squares in SQL.** `/fare-distance` gets `n, Σx, Σy, Σx², Σxy` over *all* matching trips in one query and computes the slope and intercept in Python — the trend line is exact, while only a sample of points is sent to the browser. Only trips with `fare > 0` and `distance ≥ 0.5` are used, to drop obvious bad records.
- **Deterministic sampling.** `/fare-distance` and `/outliers` take every Nth trip (`trip_id % step = 0`, with `step = ceil(total / max)`). The same request always returns the same sample, unlike `ORDER BY RANDOM()`, which would also sort all 7.5M rows.
- **Top-K in the frontend.** `/outliers` sends a capped sample (`matched` = how many trips matched, `sampled` = how many were sent) and the dashboard ranks them with its own heap.

---

## 5. Performance

Measured on a Windows laptop with browser DevTools → Network, one request at a time, second run, no filters unless shown.

| Endpoint | Time |
|---|---|
| `/api/summary` | 20.4 s |
| `/api/trips-by-hour` | 22.5 s |
| `/api/fare-by-hour` | 30.4 s |
| `/api/top-zones` | 14.3 s |
| `/api/top-zones?borough=Manhattan` | 12.7 s |
| `/api/trips` | 14.5 s |
| `/api/fare-distance` | 41.3 s |

When the dashboard first loads, it sends 7 requests at once, so each one takes longer than shown here.

**Why it's slow:** with no filter, every aggregate reads all 7.5M rows. Indexes don't help there — an index helps *find* a small slice of rows, not *add up* all of them. Even the Manhattan filter barely helps, because ~90% of trips start in Manhattan. `/fare-distance` is slowest because it scans the table twice (totals, then the sample). `/trips` is slow because of `COUNT(*)` for the page total, and because the nulls-last `ORDER BY` expression stops SQLite from using the `pickup_datetime` index.

**Planned fix:** a precomputed `zone_hour_stats` table (trips per zone × weekday × hour, with fare and distance sums), built once after loading. Filters on borough, zone and hour could then read ~44,000 rows instead of 7.5M. Fare and distance filters would still need the full `trips` table.

---

## 6. Use of AI

Per the assignment rules, AI was used only to help write this README. All backend and database code was written by the team.
