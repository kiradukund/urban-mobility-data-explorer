import sqlite3
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


if __name__ == "__main__":
    conn = create_database()
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()
    print("Tables:", tables)
    conn.close()


