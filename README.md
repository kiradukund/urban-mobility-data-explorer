# Urban Mobility Data Explorer

## Data Processing Pipeline

The pipeline cleans the raw NYC Yellow Taxi trip data, removes invalid records,
adds derived features, and exports the zone map boundaries for the dashboard.

### 1. Requirements

- Python 3.10 or newer
- About 2 GB of free RAM and 500 MB of disk space

### 2. Get the code

```bash
git clone https://github.com/kiradukund/urban-mobility-data-explorer.git
cd urban-mobility-data-explorer
git switch feature/data-processing
```

### 3. Add the trip data (not on GitHub, too large)

The trip file is too large for GitHub (285 MB), so it is not in the repository.
Download it from Canvas and place it **directly inside the `data/` folder**:

```
urban-mobility-data-explorer/
└── data/
    ├── yellow_tripdata_2019-01.csv     <-- put the downloaded file here
    ├── taxi_zone_lookup.csv            (already in the repo)
    ├── taxi_zones/                     (already in the repo)
    ├── data_processing/
    └── test/
```

The file name must be exactly `yellow_tripdata_2019-01.csv`
(or `yellow_tripdata_2019-01.parquet`; if both exist the parquet file is used).

### 4. Set up a virtual environment and install packages

From the project root (`urban-mobility-data-explorer/`):

**Linux / macOS / WSL**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r data/requirements.txt
```

**Windows (PowerShell)**
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r data\requirements.txt
```

### 5. Run the pipeline

The pipeline must be run **from inside the `data/` folder** as a module:

```bash
cd data
python -m data_processing.pipeline
```

It processes the trips in batches of 200,000 rows and prints progress:

```
batch 1: 200,000 read, 197,800 kept, 2,200 rejected
...
```

It takes about 3 minutes and finishes by printing a JSON quality summary.

### 6. Output files

All results are written to `data/output/`:

| File | Description |
|---|---|
| `clean_trips.parquet` | Cleaned trips with derived features (main table for the database) |
| `rejected_trips.csv` | Every excluded record with its `reject_reason` |
| `zones.csv` | Cleaned taxi zone lookup (location_id, borough, zone, service_zone) |
| `taxi_zones.geojson` | Zone boundaries in latitude/longitude (EPSG:4326) for the map |
| `quality_summary.json` | Row counts, rejections by reason, and repaired values |

`zones.csv`, `taxi_zones.geojson` and `quality_summary.json` are committed to the repo.
`clean_trips.parquet` and `rejected_trips.csv` are not (too large), so run the pipeline to generate them.

### 7. Run the tests

From inside `data/`:

```bash
python -m pytest
```

All 11 tests should pass.

### Troubleshooting

| Problem | Fix |
|---|---|
| `FileNotFoundError: i cound not find the yellow taxi trip dataset` | The trip file is not in `data/` or is named differently |
| `ModuleNotFoundError: No module named 'data_processing'` | You are not inside the `data/` folder, or you used `python pipeline.py` instead of `python -m data_processing.pipeline` |
| `ModuleNotFoundError: No module named 'geopandas'` (or pandas/pyarrow) | Activate the virtual environment and run `pip install -r requirements.txt` |

---

## Working on This Project (Guide for Team Members)

### Branches

| Branch | Owner area |
|---|---|
| `feature/data-processing` | Data cleaning pipeline (`data/`) |
| `feature/backend-api` | Database + API |
| `feature/frontend-ui` | Dashboard |
| `main` | Final merged version, update only through Pull Requests |

Work on your own branch, commit small and often, and open a Pull Request into `main` when a feature is ready.

To get the latest data-processing work into your branch:

```bash
git fetch origin
git merge origin/feature/data-processing
```

Never commit the raw trip CSV, `.venv/`, `clean_trips.parquet` or `rejected_trips.csv`
(they are blocked by `.gitignore` because they are too large).

---

### Data Contract: what the pipeline gives you

Run the pipeline first (see above). Everything you need is in `data/output/`.

#### `clean_trips.parquet`: main trips table (≈3.3 million rows)

| Column | Type | Description |
|---|---|---|
| `vendor_id` | int | 1 = Creative Mobile Technologies, 2 = VeriFone |
| `pickup_datetime` | timestamp | Pickup time (NYC local time) |
| `dropoff_datetime` | timestamp | Dropoff time (NYC local time) |
| `passenger_count` | int, nullable | 1–6; invalid values (e.g. 0) set to null |
| `trip_distance` | float | Miles |
| `rate_code_id` | int, nullable | 1 Standard, 2 JFK, 3 Newark, 4 Nassau/Westchester, 5 Negotiated, 6 Group ride |
| `store_and_fwd_flag` | text | `Y` / `N` |
| `pu_location_id` | int | Pickup zone → `zones.location_id` |
| `do_location_id` | int | Dropoff zone → `zones.location_id` |
| `payment_type` | int, nullable | 1 Credit card, 2 Cash, 3 No charge, 4 Dispute, 5 Unknown, 6 Voided |
| `fare_amount` | float | USD |
| `extra` | float | USD |
| `mta_tax` | float | USD |
| `tip_amount` | float | USD (only recorded for card payments) |
| `tolls_amount` | float | USD |
| `improvement_surcharge` | float | USD |
| `total_amount` | float | USD |
| `congestion_surcharge` | float | USD (missing values filled with 0) |
| `trip_duration_min` | float | **Derived:** dropoff − pickup, in minutes |
| `avg_speed_mph` | float | **Derived:** distance ÷ duration in hours |
| `fare_per_mile` | float | **Derived:** fare ÷ distance |
| `tip_pct` | float, nullable | **Derived:** tip ÷ fare × 100, card payments only (null for cash) |
| `pickup_hour` | int | **Derived:** 0–23 |
| `pickup_weekday` | int | **Derived:** 0 = Monday … 6 = Sunday |

There is no trip ID column, so let the database generate one (e.g. `INTEGER PRIMARY KEY` / `SERIAL`).

Read it in Python with:

```python
import pandas as pd
trips = pd.read_parquet("data/output/clean_trips.parquet")
```

#### `zones.csv`: zone lookup (265 rows)

| Column | Type | Example |
|---|---|---|
| `location_id` | int (unique) | `1` |
| `borough` | text | `EWR` |
| `zone` | text | `Newark Airport` |
| `service_zone` | text | `EWR` |

Zones 264 (`Unknown`) and 265 (`Outside of NYC`) are real TLC codes and appear in trips, so keep them.

#### `taxi_zones.geojson`: map boundaries (260 zones)

- Coordinates are already **latitude/longitude (EPSG:4326)**, ready for Leaflet / Mapbox / D3.
- Each feature has `properties`: `location_id`, `borough`, `zone`, `service_zone`.
- Join map shapes to trip statistics using `location_id` = `pu_location_id` or `do_location_id`.
- Zones 264 and 265 have no shape (they are not real places), so handle them in the UI as "Unknown / Outside NYC".

#### `rejected_trips.csv`: excluded records log

The original raw row plus a `reject_reason` column. Possible reasons, in the order they are checked:

`missing_required_field`, `pickup_outside_period`, `non_positive_duration`, `duration_over_limit`,
`non_positive_distance`, `distance_over_limit`, `non_positive_fare`, `fare_over_limit`,
`negative_charges`, `unknown_location_id`, `implausible_speed`, `duplicate_record`

#### `quality_summary.json`: cleaning statistics

Total / kept / rejected rows, rejection counts by reason, repaired values and the limits used.
Useful for a "Data Quality" panel on the dashboard and for the technical report.

---

### Notes for the Backend

- `pu_location_id` and `do_location_id` should be **foreign keys** to `zones.location_id`
  (every trip is already validated against the lookup, so there will be no FK errors).
- Columns that will be filtered or grouped often are good index candidates:
  `pickup_datetime`, `pu_location_id`, `do_location_id`, `pickup_hour`.
- `passenger_count`, `rate_code_id`, `payment_type` and `tip_pct` can be null, so allow NULL in the schema.
- If you need different cleaning limits (max duration, distance, fare, speed), change them in
  `data/data_processing/config.py` and re-run the pipeline. Do not filter again in the API.

### Notes for the Frontend

- Use `taxi_zones.geojson` directly for the map (no conversion needed).
- Use `borough` / `zone` names from the API, not hard-coded names.
- `tip_pct` is null for cash trips on purpose (cash tips are not recorded), so exclude nulls from tip charts
  instead of treating them as 0%.
- The data currently covers **January 2019** (check `quality_summary.json` for the exact row counts).

### Changing the pipeline

| To change… | Edit |
|---|---|
| Cleaning limits / valid codes / file paths | `data/data_processing/config.py` |
| Rejection rules | `data/data_processing/clean.py` |
| Derived features | `data/data_processing/features.py` |
| Map export | `data/data_processing/spatial.py` |

Always run `python -m pytest` inside `data/` after a change, and tell the team if an output column changes,
because the database and the dashboard depend on these column names.

## Frontend Dashboard

An interactive, dependency-free dashboard (HTML, CSS, JavaScript) for exploring NYC Yellow Taxi trips. It runs in two modes: on a small **mock dataset** with no backend, or on the **live backend API**.

### 1. What the dashboard shows

| Section | What you see |
|---|---|
| **City Pulse** | Total trips, average fare, average distance, fare per mile, and the busiest hour of the day |
| **24-hour rhythm** | Trips per pickup hour; click a bar to filter the whole dashboard to that hour |
| **Patterns** | Average fare by hour, and the top pickup zones (click a zone to filter) |
| **Relationships** | Fare × distance scatter plot with a least-squares trend line, optionally coloured by borough |
| **Outliers** | Top 10 trips that are most unusual for their distance, or simply the most expensive |
| **Evidence** | Sortable, paginated trip table; click a row (or press Enter) for full trip details |

Filters (borough, pickup zone, hour range, fare range, distance range) apply to every section at once. Active filters appear as removable chips, and **Reset** clears them all. The layout adapts to desktop, tablet and phone widths.

### 2. Files

The frontend lives on the `feature/frontend-ui` branch:

```
urban-mobility-data-explorer/
├── index.html            # page structure and sections
├── styles.css            # design tokens, layout, responsive rules
├── app.js                # state, filters, calculations, rendering, data source switch
├── charts.js             # rhythm bars, fare-by-hour line chart, zone list, scatter plot
├── algorithms.js         # hand-written min-heap and Top-K
├── mock/
│   └── mock_data.json    # small development dataset
└── docs/                 # design notes
```

Scripts load in this order at the end of `index.html`: `algorithms.js` → `charts.js` → `app.js`.

### 3. Requirements

- A modern browser (Chrome, Edge or Firefox)
- **One** of these to serve the files:
  - **VS Code** with the **Live Server** extension, or
  - **Python 3** (for its built-in web server)

No npm, no build step, no libraries.

### 4. Get the code

```bash
git clone https://github.com/kiradukund/urban-mobility-data-explorer.git
cd urban-mobility-data-explorer
git switch feature/frontend-ui
```

### 5. Choose the data source

At the top of `app.js`:

```js
const config = {
  mockDataPath: "mock/mock_data.json",
  loadDelayMs: 0,
  useMockData: true,                       // true = mock data, false = live API
  apiBaseUrl: "http://localhost:3000/api"  // where the backend runs
};
```

| Mode | Setting | Needs the backend? |
|---|---|---|
| **Mock** | `useMockData: true` | No. Reads `mock/mock_data.json` and shows a "Development placeholder data" badge |
| **Live API** | `useMockData: false` | Yes. Start the backend first (see the Backend section) |

Charts, table and drawer work the same in both modes. Only the data source changes.

### 6. Run the dashboard

**Option A: VS Code Live Server**
1. Open the project folder in VS Code.
2. Open `index.html`.
3. Click **Go Live** (bottom-right of the status bar).
4. The browser opens **http://127.0.0.1:5500/index.html**.

**Option B: Python**

From the project root:

```bash
python -m http.server 5500
```

Then open **http://localhost:5500**. Press `Ctrl+C` in the terminal to stop it.

> ⚠ **Do not open `index.html` by double-clicking it.** Browsers block `fetch()` on `file://` pages, so the dashboard shows "Trip data could not be loaded".

### 7. Check that it works

1. Press **F12 → Console**: there should be no red errors.
2. The filter bar shows the number of matching trips (e.g. "20 trips match" in mock mode).
3. Click an hour bar, a zone, a table row (the trip drawer opens; **Escape** closes it) and the **Most expensive** lens.
4. Choose filters that match nothing (e.g. Fare "Over $60" + Distance "Under 2 mi"): every chart shows a "No trips match" message and a **Reset filters** button.
5. Press **Ctrl+Shift+M** in DevTools to check the phone layout.

### 8. Custom algorithm: Top-K with a min-heap

The **Outliers** section ranks trips with a hand-written **min-heap** (`algorithms.js`), with no built-in sort and no library heap.

- One pass over the matching trips keeps only the **K** strongest (K = 10): **O(n log k)** time and **O(k)** extra space, instead of sorting everything in O(n log n).
- **Unusual for distance:** score = fare − expected fare from a least-squares trend line. The line is fitted only on trips of 0.5 miles or more, but every trip with a fare and distance is scored, so very short, very expensive trips are found.
- **Most expensive:** score = fare.
- **Ties:** equal scores rank the smaller trip id first, so the result is always the same.
- Trips with a missing fare or distance are skipped and counted as excluded.

Pseudo-code and complexity analysis are in the technical report.

### 9. Mock data

`mock/mock_data.json` has the same shape as the API responses:

```json
{
  "meta":  { "isMock": true, "periodStart": "2024-01-08", "periodEnd": "2024-01-14" },
  "zones": [ { "id": 1, "name": "Midtown Center", "borough": "Manhattan" } ],
  "trips": [ { "id": 1001, "pickupTime": "2024-01-12T17:09:00", "pickupZoneId": 3,
               "dropoffZoneId": 4, "durationMin": 9, "distance": 1.5, "fare": 9.36 } ]
}
```

Missing values are `null`, never `0`, so averages and sorting skip them instead of treating them as real zeros. Every number in mock mode is a development placeholder, not a finding about New York.

### 10. Troubleshooting

| Problem | Fix |
|---|---|
| "Trip data could not be loaded" | Page opened as `file://`, or `useMockData: false` with no backend running. Use step 6, or switch to mock mode |
| Red **CORS** error in the console | The backend must be running and allow the frontend's origin (`http://127.0.0.1:5500` / `http://localhost:5500`) |
| `Cannot set properties of null` in the console | An `id` in `index.html` doesn't match the one `app.js` looks for |
| Page looks unstyled | `styles.css` not found. Serve from the project root, not from a subfolder |
| Port 5500 already in use | Close the other server, or use another port (e.g. `python -m http.server 5501`) |
