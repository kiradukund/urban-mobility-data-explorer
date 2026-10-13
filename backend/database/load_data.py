import sqlite3
import pandas as pd
from pathlib import Path

# backend/database/
HERE = Path(__file__).resolve().parent
PROJECT_ROOT = HERE.parent.parent     # urban-mobility-data-explorer/

SCHEMA_PATH = HERE / "schema.sql"
DB_PATH = HERE / "urban_mobility.db"
OUTPUT_DIR = PROJECT_ROOT / "data" / "output"


def create_database():
    """Create a fresh database file and build all tables from schema.sql."""
    conn = sqlite3.connect(DB_PATH)
    # SQLite ignores foreign keys unless this is turned on for every connection
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA_PATH.read_text())
    return conn


def load_zones(conn):
    """Insert the 265 taxi zones from zones.csv into the zones tables."""
    df = pd.read_csv(OUTPUT_DIR / "zones.csv", keep_default_na=False)
    rows = list(df.itertuples(index=False, name=None))
    conn.executemany(
        "INSERT INTO zones (location_id, borough, zone, service_zone) VALUES (?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    return len(rows)

if __name__ == "__main__":
    conn = create_database()
    count = load_zones(conn)
    print("Zones loaded:", count)
    conn.close()

