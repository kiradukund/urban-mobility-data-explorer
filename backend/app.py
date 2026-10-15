import sqlite3
from pathlib import Path


from flask import Flask, jsonify, request
from flask_cors import CORS

DB_PATH = Path(__file__).resolve().parent / "database" / "urban_mobility.db"

app = Flask(__name__)
CORS(app)  # lets the frontend on another port call this API


def get_db():
    """Open the database so each row can be turned into a dictionary."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def build_filters(skip=()):
    """Turn the URL filters into a SQL WHERE clause and its values"""
    conditions = []
    values = []
    args = request.args

    # borough
    borough = args.get("borough")
    if borough and "borough" not in skip:
        conditions.append("z.borough = ?")
        values.append(borough)

    # zoneId -> pickup zone
    zone_id = args.get("zoneId", type=int)
    if zone_id is not None and "zoneId" not in skip:
        conditions.append("t.pickup_hour BETWEEN ? AND ?")
        values.append(zone_id)

    # hour range (inclusive on both ends)
    if "hour" not in skip and ("hourFrom" in args or "hourTo" in args):
        hour_from = args.get("hourFrom", default=0, type=int)
        hour_to = args.get("hourTo", default=23, type=int)
        conditions.append("t.pickup_hour BETWEEN ? AND ?")
        values.extend([hour_from, hour_to])

    # fare: at least fareMin
    fare_min = args.get("fareMin", type=float)
    if fare_min is not None:
        conditions.append("t.fare_amount >= ?")
        values.append(fare_min)

    # fare: below fareMax
    fare_max = args.get("fareMax", type=float)
    if fare_max is not None:
        conditions.append("t.fare_amount < ?")
        values.append(fare_max)


    # distance: at least distanceMin
    distance_min = args.get("distanceMin", type=float)
    if distance_min is not None:
        conditions.append("t.trip_distance >= ?")
        values.append(distance_min)


    # distance: below distanceMax
    distance_max = args.get("distanceMax", type=float)
    if distance_max is not None:
        conditions.append("t.trip_distance < ?")
        values.append(distance_max)


    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    return where, values


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


@app.route("/api/meta")
def meta():
    """Return the date range actually covered by the trips in the database."""
    conn = get_db()
    row = conn.execute(
        "SELECT date(MIN(pickup_datetime)) AS period_start,"
        "date(MAX(pickup_datetime)) AS period_end FROM trips"
    ).fetchone()
    conn.close()
    return jsonify({
        "isMock": False,
        "periodStart": row["period_start"],
        "periodEnd": row["period_end"],
    })


@app.route("/api/summary")
def summary():
    """Headline numbers for all trips that match the current filters."""
    where, values = build_filters()
    conn = get_db()
    row = conn.execute(
        "SELECT COUNT(*) AS total, "
        "AVG(t.fare_amount) AS avg_fare, "
        "AVG(t.trip_distance) AS avg_distance, "
        "SUM(t.fare_amount) / SUM(t.trip_distance) AS fare_mile "
        "FROM trips t JOIN zones z ON t.pu_location_id = z.location_id "
        +where,
        values,
    ).fetchone()
    conn.close()

    def rounded(number):
        return round(number, 2) if number is not None else None

    return jsonify({
        "totalTrips": row["total"],
        "avgFare": rounded(row["avg_fare"]),
        "avgDistance": rounded(row["avg_distance"]),
        "fareMile": rounded(row["fare_mile"]),
    })

@app.route("/api/trips-by-hour")
def trips_by_hour():
    """Trip counts for each pickup hour, 0 to 23 (hour filters are ignored)."""
    where, values = build_filters(skip=("hour",))
    conn = get_db()
    rows = conn.execute(
        "SELECT t.pickup_hour AS hour, COUNT(*) AS trips "
        "FROM trips t JOIN zones z ON t.pu_location_id = z.location_id "
        + where +
        "GROUP BY hour",
        values,
    ).fetchall()
    conn.close()

    hourly = [0] * 24
    for row in rows:
        hourly[row["hour"]] = row["trips"]
    return jsonify({"hourly": hourly})


@app.route("/api/fare-by-hour")
def fare_by_hour():
    """Average fare for each pickup hour, 0 to 23 (hour filters are ignored)."""
    where, values = build_filters(skip=("hour",))
    conn = get_db()
    rows = conn.execute(
        "SELECT t.pickup_hour AS hour, AVG(t.fare_amount) AS avg_fare "
        "FROM trips t JOIN zones z ON t.pu_location_id = z.location_id "
        + where +
        "GROUP BY hour",
        values,
    ).fetchall()
    conn.close()

    fares = [None] * 24
    for row in rows:
        fares[row["hour"]] = round(row["avg_fare"], 2)
    return jsonify({"fareByHour": fares})


@app.route("/api/top-zones")
def top_zones():
    """Busiest pickup zones for the current filters (zone filter is ignored)."""
    limit = request.args.get("limit", default=8, type=int)
    where, values = build_filters(skip=("zoneId"))
    conn = get_db()

    total = conn.execute(
        "SELECT COUNT(*) FROM trips t JOIN zones z ON t.pu_location_id = z.location_id "
        + where,
        values,
    ).fetchone()[0]

    rows = conn.execute(
        "SELECT z.location_id AS zone_id, z.zone AS name, z.borough AS borough, "
        "COUNT(*) AS trips, AVG(t.fare_amount) AS avg_fare "
        "FROM trips t JOIN zones z ON t.pu_location_id = z.location_id "
        + where +
        "GROUP BY z.location_id ORDER BY trips DESC LIMIT ?",
        values + [limit],
    ).fetchall()
    conn.close()

    result = []
    for row in rows:
        result.append({
            "zoneId": row["zone_id"],
            "name": row["name"],
            "borough": row["borough"],
            "trips": row["trips"],
            "share": round(row["trips"] * 100 / total, 1) if total else None,
            "avgFare": round(row["avg_fare"], 2),
        })
    return jsonify({"zones": result})

if __name__ == "__main__":
    app.run(debug=True, port=3000)
