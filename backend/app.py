import sqlite3
from pathlib import Path


from flask import Flask, jsonify
from flask_cors import CORS

DB_PATH = Path(__file__).resolve().parent / "database" / "urban_mobility.db"

app = Flask(__name__)
CORS(app)  # lets the frontend on another port call this API


def get_db():
    """Open the database so each row can be turned into a dictionary."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


@app.route("/api/health")
def health():
    """Simple check that the API is running"""
    return jsonify({"status": "ok"})


@app.route("/api/zones")
def zones():
    """Return every taxi zone with its id, name and borough."""
    conn = get_db()
    rows = conn.execute(
        "SELECT location_id AS id, zone AS name, borough FROM zones ORDER BY location_id"
    ).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])


if __name__ == "__main__":
    app.run(debug=True, port=3000)
