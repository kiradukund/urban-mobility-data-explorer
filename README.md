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
