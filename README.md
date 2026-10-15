# Urban Mobility Data Explorer

An end-to-end system for exploring **New York City Yellow Taxi trips (January 2019)**: a Python cleaning pipeline, a SQLite database, a Flask REST API, and an interactive dashboard built with plain HTML, CSS and JavaScript, including a hand-written Top-K ranking algorithm.

| | |
|---|---|
| 🎥 **Video walkthrough** | https://drive.google.com/file/d/1DXZq4gidpqw3B4J9ttEujSCwrDK806wm/view?usp=sharing |
| 🗄️ **Prepared database** (`urban_mobility.zip`, ~495 MB) | https://drive.google.com/file/d/1q4Opxxvu17Zh8ogH2iN-PrPCndQvTrYE/view?usp=sharing |
| 📄 **Technical report** | https://drive.google.com/file/d/16nWwuGzi9U7bpWKCMHv7_AqeGM1yHhp6/view?usp=sharing |
| ✅ **Team task sheet** | [Google Sheet](https://docs.google.com/spreadsheets/d/1d-wc7vEV7Mh1RwuPFk3NMYn0ZM0E3tuL2cny6_v9Bo8/edit?usp=sharing) |

---

## Team

| Member | Role | Owns |
|---|---|---|
| **Emmanuel Amarikwa** | Data cleaning | `data/`: cleaning pipeline, validation rules, derived features, tests, zone exports |
| **UWERA Sylvie** | Backend | `backend/`: database schema, data loader, Flask REST API |
| **IRADUKUNDA CYUSA Kevin** | Frontend + algorithms | `index.html`, `styles.css`, `app.js`, `charts.js`, `algorithms.js`, `mock/`, `docs/` |

---

## Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Repository structure](#3-repository-structure)
4. [Quick start (prepared database)](#4-quick-start-prepared-database)
5. [Build everything from the raw data](#5-build-everything-from-the-raw-data)
6. [Data processing pipeline](#6-data-processing-pipeline)
7. [Database](#7-database)
8. [REST API](#8-rest-api)
9. [Frontend dashboard](#9-frontend-dashboard)
10. [Custom algorithm: Top-K with a min-heap](#10-custom-algorithm-top-k-with-a-min-heap)
11. [Testing](#11-testing)
12. [Performance and known limitations](#12-performance-and-known-limitations)
13. [Troubleshooting](#13-troubleshooting)
14. [Development workflow](#14-development-workflow)
15. [AI usage and CodeVibe reports](#15-ai-usage-and-codevibe-reports)

---

## 1. Overview

The dashboard answers one question: **how does New York move by taxi, and which trips don't fit the pattern?**

| Section | What it shows |
|---|---|
| **City Pulse** | Trip count, average fare, average distance, fare per mile, and the busiest hours |
| **24-hour rhythm** | Trips per pickup hour; click a bar to filter everything to that hour |
| **Patterns** | Average fare by hour and the busiest pickup zones (click a zone to filter) |
| **Relationships** | Fare × distance scatter plot with a least-squares trend line, optionally coloured by borough |
| **Outliers** | Top 10 trips that are most unusual for their distance, or simply the most expensive |
| **Evidence** | Sortable, paginated trip table; click a row for full trip details |

Filters (borough, pickup zone, hour range, fare range, distance range) apply to every section at once.

**Dataset in numbers** (from the API on the full database):

| Trips | Zones | Period | Average fare | Average distance | Fare per mile |
|---|---|---|---|---|---|
| 7,579,062 | 265 | 1–31 Jan 2019 | $12.16 | 2.82 mi | $4.32 |

---

## 2. Architecture

```
 OFFLINE · run once
 ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
 │ Raw TLC data         │──▶│ Data pipeline        │──▶│ data/output/         │──▶│ load_data.py         │
 │ trips CSV/Parquet    │   │ pandas, 200k batches │   │ clean_trips.parquet  │   │ schema.sql + inserts │
 │ zone lookup, shapes  │   │ clean → features →   │   │ zones.csv, geojson   │   │                      │
 └──────────────────────┘   │ validate → dedupe    │   │ rejected_trips.csv   │   └──────────┬───────────┘
                            └──────────────────────┘   └──────────────────────┘              ▼
 ONLINE · per request                                                              ┌──────────────────────┐
 ┌──────────────────────┐  HTTP GET  ┌──────────────────────┐        SQL           │ SQLite               │
 │ Browser dashboard    │──────────▶│ Flask REST API       │────────────────────▶│ urban_mobility.db    │
 │ localhost:5500       │◀──────────│ localhost:3000/api   │◀────────────────────│ star schema, 1.6 GB  │
 │ HTML · CSS · JS      │    JSON    │ 10 GET endpoints     │        rows          └──────────────────────┘
 └──────────────────────┘            └──────────────────────┘
```

| Layer | Technology | Responsibility |
|---|---|---|
| Data pipeline | Python 3.10+, pandas, pyarrow, geopandas, pytest | Clean, validate and enrich raw trips; log every rejection; export zone geometry |
| Database | SQLite 3 | Star schema, foreign keys, CHECK constraints, indexes |
| API | Flask 3, flask-cors | Filtered aggregates, paging, sorting, sampling, regression sums, input validation |
| Frontend | HTML, CSS, vanilla JavaScript (no libraries, no build step) | Filters, hand-drawn SVG charts, table, trip drawer, Top-K ranking |

---

## 3. Repository structure

```
urban-mobility-data-explorer/
├── index.html                 Page structure and sections
├── styles.css                 Design tokens, layout, responsive rules
├── app.js                     State, filters, data layer (mock or API), rendering
├── charts.js                  Hour bars, fare-by-hour line, zone list, scatter plot (SVG)
├── algorithms.js              Hand-written min-heap and Top-K
├── mock/mock_data.json        20-trip development dataset (same shape as the API)
├── docs/
│   ├── api_contract.md        Agreed API request/response shapes
│   └── pseudocode.md          Top-K pseudocode and complexity
├── backend/
│   ├── app.py                 Flask API (port 3000)
│   ├── requirements.txt
│   ├── README.md              Backend details: schema, endpoints, design notes
│   └── database/
│       ├── schema.sql         Star schema + indexes
│       └── load_data.py       Builds urban_mobility.db from the pipeline output
├── data/
│   ├── data_processing/       config, load, clean, features, spatial, pipeline
│   ├── test/test_pipeline.py  11 pytest tests
│   ├── output/                zones.csv, taxi_zones.geojson, quality_summary.json
│   ├── taxi_zone_lookup.csv
│   ├── taxi_zones/            TLC zone shapefile
│   └── requirements.txt
└── codevibe-reports/          Sealed CodeVibe report from each member
```

Not committed (too large, or regenerated): the raw trip CSV, `clean_trips.parquet`, `rejected_trips.csv`, `urban_mobility.db`, virtual environments. See `.gitignore`.

---

## 4. Quick start (prepared database)

The fastest way to run the full system. **Requirements:** Python 3.10+, a modern browser, about 2 GB of free disk space.

**1. Get the code**

```bash
git clone https://github.com/kiradukund/urban-mobility-data-explorer.git
cd urban-mobility-data-explorer
```

**2. Install the backend packages**

```powershell
# Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

```bash
# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
```

**3. Add the database.** Download `urban_mobility.zip` from the link at the top of this page and extract it so that the file sits at:

```
backend/database/urban_mobility.db      (about 1.6 GB)
```

The name and location must match exactly. A wrong path makes SQLite create an empty file, and every endpoint then fails with `no such table: trips`.

**4. Start the API** (terminal 1, from the repository root):

```bash
python backend/app.py
```

Check it: <http://127.0.0.1:3000/api/health> returns `{"status": "ok"}`.

**5. Serve the dashboard** (terminal 2, from the repository root):

```bash
python -m http.server 5500
```

**6. Open <http://localhost:5500>.** The first load reads the database from disk and takes **1–2 minutes**; later views are much faster.

> Don't open `index.html` by double-clicking it. Browsers block `fetch()` on `file://` pages.

**Without the backend:** set `useMockData: true` at the top of `app.js` to run the dashboard on the 20-trip development dataset. A "Development placeholder data" badge marks this mode.

---

## 5. Build everything from the raw data

Use this to reproduce the database instead of downloading it.

**1. Add the raw trip file** (285 MB, from Canvas) directly inside `data/`:

```
data/yellow_tripdata_2019-01.csv        (or .parquet; Parquet is used if both exist)
```

**2. Install packages and run the pipeline** (from inside `data/`, as a module):

```bash
pip install -r data/requirements.txt
cd data
python -m data_processing.pipeline
cd ..
```

It streams the file in 200,000-row batches, prints progress per batch and finishes with a JSON quality summary.

**3. Build the database:**

```bash
pip install -r backend/requirements.txt pandas pyarrow
python backend/database/load_data.py
```

This creates `backend/database/urban_mobility.db`, loads the 265 zones and inserts the cleaned trips in 100,000-row batches. It takes several minutes. Then continue from step 4 of the quick start.

---

## 6. Data processing pipeline

_Owner: Emmanuel Amarikwa · code in `data/data_processing/`_

Each batch passes through five stages: **read → normalise** (rename columns, coerce types, trim flags) **→ repair** (invalid category codes become `NULL`) **→ add features → validate**. Duplicate rows are detected across batches.

### Rejection rules

Rules are checked in this order; the first match is recorded as the `reject_reason`.

| # | Reason | Rule |
|---|---|---|
| 1 | `missing_required_field` | Any of pickup/dropoff time, distance, pickup/dropoff zone, fare or total is empty |
| 2 | `pickup_outside_period` | Pickup not in January 2019 |
| 3 | `non_positive_duration` | Duration ≤ 0 minutes |
| 4 | `duration_over_limit` | Duration > 240 minutes |
| 5 | `non_positive_distance` | Distance ≤ 0 |
| 6 | `distance_over_limit` | Distance > 100 miles |
| 7 | `non_positive_fare` | Fare or total ≤ 0 |
| 8 | `fare_over_limit` | Fare > $500 |
| 9 | `negative_charges` | Extra, MTA tax, tip, tolls or improvement surcharge < 0 |
| 10 | `unknown_location_id` | Pickup or dropoff zone not in the TLC lookup |
| 11 | `implausible_speed` | Average speed > 80 mph |
| 12 | `duplicate_record` | Exact duplicate of an earlier row (only if no other rule applies) |

Limits live in `data/data_processing/config.py`. Change them there and re-run the pipeline; the API never re-filters data.

### Derived features

| Column | Definition |
|---|---|
| `trip_duration_min` | Dropoff − pickup, in minutes |
| `avg_speed_mph` | Distance ÷ duration in hours |
| `fare_per_mile` | Fare ÷ distance |
| `tip_pct` | Tip ÷ fare × 100, **card payments only** (`NULL` for cash, whose tips are not recorded) |
| `pickup_hour` | 0–23 |
| `pickup_weekday` | 0 = Monday … 6 = Sunday |

Divisions by zero produce `NULL`, never infinity. Invalid passenger counts, rate codes and payment types are set to `NULL` instead of rejecting the trip.

### Outputs (`data/output/`)

| File | Contents | In Git? |
|---|---|---|
| `clean_trips.parquet` | Cleaned trips with derived features | No (regenerate) |
| `rejected_trips.csv` | Every excluded raw row plus its `reject_reason` | No (regenerate) |
| `zones.csv` | 265 zones: `location_id, borough, zone, service_zone` | Yes |
| `taxi_zones.geojson` | 260 zone boundaries in latitude/longitude (EPSG:4326) | Yes |
| `quality_summary.json` | Row counts, rejections by reason, repaired values, limits used | Yes |

Zones 264 (Unknown) and 265 (Outside of NYC) are real TLC codes with no map shape; they are kept.

---

## 7. Database

_Owner: UWERA Sylvie · code in `backend/database/` · full details in [`backend/README.md`](backend/README.md)_

A **star schema**: one fact table of trips and four small lookup tables.

```
                 vendors
                    │
   zones ──── trips (fact, 7,579,062 rows) ──── payment_types
 (pickup and        │
  dropoff)      rate_codes
```

- **Integrity:** foreign keys enforced on load; `CHECK` constraints on `pickup_hour` (0–23), `pickup_weekday` (0–6), `store_and_fwd_flag` (Y/N) and dropoff ≥ pickup; optional facts allow `NULL` so "unknown" is never confused with zero.
- **Indexes:** `pickup_datetime`, `pu_location_id`, `do_location_id`, and `(pickup_weekday, pickup_hour)`.

---

## 8. REST API

_Owner: UWERA Sylvie · `backend/app.py` · base URL `http://localhost:3000/api`_

All endpoints are `GET` and return JSON. Every data endpoint uses one shared filter builder, so all sections of the dashboard describe the same set of trips.

| Endpoint | Ignores filter | Returns |
|---|---|---|
| `/health` | — | `{status}` |
| `/meta` | — | `{isMock, periodStart, periodEnd}` |
| `/zones` | — | `[{id, name, borough}]`, 265 zones |
| `/summary` | — | `{totalTrips, avgFare, avgDistance, fareMile}`; fareMile = Σ fare ÷ Σ distance |
| `/trips-by-hour` | hour | `{hourly: [24 counts]}` |
| `/fare-by-hour` | hour | `{fareByHour: [24 averages or null]}` |
| `/top-zones?limit=8` | zone | `{zones: [{zoneId, name, borough, trips, share, avgFare}]}`, busiest first |
| `/trips?page&pageSize&sortBy&sortDir` | — | `{rows, total, page, totalPages}`; pageSize ≤ 100; sort column from a whitelist; nulls last |
| `/fare-distance?maxPoints=2000` | — | `{points, total, model: {slope, intercept}}`; least-squares line over all qualifying trips (fare > 0, distance ≥ 0.5 mi) |
| `/outliers` | — | `{trips, matched, sampled}`; up to 20,000 evenly spaced matching trips for the frontend's Top-K |

**Filter parameters** (all optional, combined with AND):

| Parameter | Valid values | Meaning |
|---|---|---|
| `borough` | text, e.g. `Manhattan` | Pickup borough |
| `zoneId` | integer 1–265 | Pickup zone |
| `hourFrom`, `hourTo` | integers 0–23, from ≤ to | Pickup hour range (inclusive) |
| `fareMin`, `fareMax` | numbers ≥ 0 | Fare ≥ min and < max |
| `distanceMin`, `distanceMax` | numbers ≥ 0 | Distance ≥ min and < max |

**Errors** use one format:

```json
{ "error": { "code": "BAD_PARAMETER", "message": "hourFrom must not be after hourTo" } }
```

| Status | Code | When |
|---|---|---|
| 400 | `BAD_PARAMETER` | Non-numeric or out-of-range parameter |
| 404 | `NOT_FOUND` | Unknown endpoint |
| 500 | `SERVER_ERROR` | Unexpected failure |

All values are passed to SQLite as bound parameters, and sort columns come from a whitelist, so URL input never becomes SQL text. The agreed contract is in [`docs/api_contract.md`](docs/api_contract.md).

---

## 9. Frontend dashboard

_Owner: IRADUKUNDA CYUSA Kevin · repository root_

A single page with no libraries and no build step. Scripts load in order: `algorithms.js` → `charts.js` → `app.js`.

### Data source

At the top of `app.js`:

```js
const config = {
    mockDataPath: "mock/mock_data.json",
    loadDelayMs: 0,
    useMockData: false,                      // false = live API (default), true = mock data
    apiBaseUrl: "http://localhost:3000/api"  // where the backend runs
};
```

| Mode | Setting | Needs the backend? |
|---|---|---|
| **Live API** (default) | `useMockData: false` | Yes. Start it first (section 4) |
| **Mock** | `useMockData: true` | No. 20 placeholder trips, marked with a "Development placeholder data" badge |

Both modes produce the same view object, so charts, table and drawer behave identically. Mock values are placeholders, not findings about New York, and missing values are `null`, never `0`.

### How it stays correct on a slow backend

| Mechanism | What it does |
|---|---|
| Parallel requests | The 7 view requests start together; the page waits for the slowest, not the sum |
| Stale-render guard | Each render takes a number; an older response arriving late is discarded |
| Response cache | Repeated URLs are answered from memory. Paging re-requests only `/trips`; switching the outlier lens sends no request |
| Loading, error and empty states | Banner and skeleton rows while loading; readable error with retry; "No trips match" with a reset button |

### Check that it works

1. Press **F12 → Console**: there should be no red errors.
2. The filter bar shows **7,579,062 trips match** on the full database.
3. Click an hour bar, a zone, a table row (the drawer opens; **Escape** closes it) and the **Most expensive** lens.
4. Choose filters that match nothing (e.g. Fare "Over $60" + Distance "Under 2 mi"): every section shows "No trips match" and a **Reset filters** button.
5. Press **Ctrl+Shift+M** in DevTools to check the phone layout.

---

## 10. Custom algorithm: Top-K with a min-heap

_Owner: IRADUKUNDA CYUSA Kevin · `algorithms.js` · pseudocode in [`docs/pseudocode.md`](docs/pseudocode.md)_

The Outliers section ranks the **K = 10** strongest trips with a hand-written binary min-heap, with no built-in sort and no library heap.

- One pass keeps only the K strongest trips seen so far; the heap's root is always the weakest of them, so a new trip either replaces the root or is skipped.
- **Time O(n log k)**, **extra space O(k)**, compared with O(n log n) for sorting everything.
- **Unusual for distance:** score = fare − (intercept + slope × distance) from the least-squares trend line. The line is fitted on trips of 0.5 miles or more, but every trip with a fare and distance is scored, so very short, very expensive trips are still found.
- **Most expensive:** score = fare.
- **Ties:** the smaller trip id ranks first, so results are deterministic. Trips with a missing fare or distance are skipped and counted as excluded.

In API mode the heap runs in the browser on the `/outliers` sample (up to 20,000 evenly spaced matching trips) using the trend line from `/fare-distance`. The result is therefore the Top-10 **of that sample**.

---

## 11. Testing

| What | How | Result |
|---|---|---|
| Pipeline rules, features, duplicate detection | `cd data` then `python -m pytest` | 11 tests pass |
| API | Open `/api/health`, `/api/summary`, `/api/top-zones` in the browser | JSON, status 200 |
| API validation | `/api/summary?hourFrom=20&hourTo=3` | 400 `BAD_PARAMETER` |
| Dashboard | The checklist in section 9 | No console errors |

---

## 12. Performance and known limitations

Measured on a development laptop against the full 1.6 GB database:

| Scenario | Time |
|---|---|
| First unfiltered load (slowest endpoint: `/top-zones`) | ~1–2 minutes |
| Whole dashboard filtered to one zone | ~9 seconds |
| Returning to an already viewed filter, page or lens | Instant (frontend cache) |

**Known limitations**

- **Unfiltered queries read all 7.58M rows**, so no index can speed them up. Caching unfiltered responses on the server or adding a pre-aggregated hour × zone table would remove the first-load wait.
- **Outliers are ranked from a sample** of up to 20,000 matching trips, not from every trip.
- **`quality_summary.json` does not match the database:** it reports 3,313,866 kept rows, while the database holds 7,579,062 trips. Confirm which pipeline run produced the database and regenerate the summary from that run.
- Durations are shown with decimals (e.g. 1.32 min), and zones in the EWR, "Unknown" and "N/A" boroughs have no colour in the scatter legend.

---

## 13. Troubleshooting

| Problem | Fix |
|---|---|
| "Trip data could not be loaded. Failed to fetch" | The API is not running on port 3000. Start `python backend/app.py` from the repository root |
| `no such table: trips` | `urban_mobility.db` is missing, empty or in the wrong folder. It must be `backend/database/urban_mobility.db` (~1.6 GB) |
| Port 3000 or 5500 already in use | Another server is still running. Stop it (Ctrl+C, or `Get-Process python \| Stop-Process` on Windows) and start again |
| The API works but the dashboard cannot reach it on Windows | Change `apiBaseUrl` in `app.js` to `http://127.0.0.1:3000/api` |
| Red **CORS** error in the console | The backend must be running; `flask-cors` allows the dashboard's origin |
| Page looks unstyled | Serve from the repository root, not a subfolder |
| `FileNotFoundError: ... yellow taxi trip dataset` | The raw trip file is not in `data/` or is named differently |
| `No module named 'data_processing'` | Run the pipeline from inside `data/` with `python -m data_processing.pipeline` |
| `No module named 'geopandas'` (or pandas / pyarrow / flask) | Activate the virtual environment and install the matching `requirements.txt` |

---

## 14. Development workflow

Each member worked on a feature branch, merged into `main` through pull requests:

| Branch | Content | Merged |
|---|---|---|
| `feature/data-processing` | Cleaning pipeline and tests | Via `feature/backend-api` |
| `feature/backend-api` | Database and API | PR #1 |
| `feature/frontend-ui` | Dashboard and algorithm | PR #2 |

`main` is the final, runnable version. Commit history on each branch shows who built what.

---

## 15. AI usage and CodeVibe reports

Each member's CodeVibe export is in [`codevibe-reports/`](codevibe-reports/), exported from the CodeVibe extension and committed by its owner without modification. A `.gitattributes` rule (`codevibe-reports/** -text`) stops Git from changing line endings, so the files stay byte-for-byte identical to the exports.

---

_Data: NYC Taxi & Limousine Commission (TLC) Yellow Taxi Trip Records and Taxi Zone lookup, January 2019._
