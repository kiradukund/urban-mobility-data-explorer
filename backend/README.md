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

- Foreign keys enforced (`PRAGMA foreign_keys
