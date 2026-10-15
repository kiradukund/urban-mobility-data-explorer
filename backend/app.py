import math
import sqlite3
from pathlib import Path


from flask import Flask, jsonify, request
from flask_cors import CORS

DB_PATH = Path(__file__).resolve().parent / "database" / "urban_mobility.db"

app = Flask(__name__)
CORS(app)  # lets the frontend on another port call this API

class BadParameter(Exception):
    """Raised when s URL parameter has an invalid value."""

    def __init__(self, message):
        super().__init__(message)
        self.message = message


# ------------ Error handlers: every error return the same JSON shaPE _____


@app.errorhandler(BadParameter)
def handler_bad_parameter(error):
    body = {"error": {"code": "BAD_PARAMETER", "message": error.message}}
    return jsonify(body), 400


@app.errorhandler(404)
def handle_not_found(error):
    body = {"error": {"code": "NOT_FOUND", "message": "UNKNOWN endpoint"}}
    return jsonify(body), 404


@app.errorhandler(500)
def handle_server_error(error):
    body = {"error": {"code": "SERVER_ERROR", "message": "Something went wrong on the server"}}
    return jsonify(body), 500


# -------- Reading and validating numbers from the URL ----------

def read_number(name, kind=float, low=None, high=None):
    """Read an optional number from the URL and raise BadParameter if it is invalid."""
    raw = request.args.get(name)
    if raw is None or raw == "":
        return None # not sent = no filter

    try:
        value = kind(raw) # "7", "abc" -> error
    except ValueError:
        raise BadParameter(f"{name} must be a number")

    if low is not None and value < low:
        raise BadParameter(f"{name} must be at least {low}")
    if high is not None and value > high:
        raise BadParameter(f"{name} must be at most {high}")
    return value


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
    zone_id = read_number("zoneId", int, 1, 265)
    if zone_id is not None and "zoneId" not in skip:
        conditions.append("t.pu_location_id = ?")
        values.append(zone_id)

    # hour range (inclusive on both ends)
    if "hour" not in skip:
        hour_from = read_number("hourFrom", int, 0, 23)
        hour_to = read_number("hourTo", int, 0, 23)
        hour_from = 0 if hour_from is None else hour_from
        hour_to = 23 if hour_to is None else hour_to
        if hour_from > hour_to:
            raise BadParameter("hourFrom must not be after hourTo")
        if (hour_from, hour_to) != (0, 23):
            conditions.append("t.pickup_hour BETWEEN ? AND ?")
            values.extend([hour_from, hour_to])

    # fare: at least fareMin
    fare_min = read_number("fareMin", float, 0)
    if fare_min is not None:
        conditions.append("t.fare_amount >= ?")
        values.append(fare_min)

    # fare: below fareMax
    fare_max = read_number("fareMax", float, 0)
    if fare_max is not None:
        conditions.append("t.fare_amount < ?")
        values.append(fare_max)


    # distance: at least distanceMin
    distance_min = read_number("distanceMin", float, 0)
    if distance_min is not None:
        conditions.append("t.trip_distance >= ?")
        values.append(distance_min)


    # distance: below distanceMax
    distance_max = read_number("distanceMax", float, 0)
    if distance_max is not None:
        conditions.append("t.trip_distance < ?")
        values.append(distance_max)


    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    return where, values

def trip_to_json(row):
    """Turn one trips row into the trip object agreed in the API contract,"""
    return {
        "id": row["trip_id"],
        "pickupTime": row["pickup_datetime"].replace(" ", "T"),
        "pickupZoneId": row["pu_location_id"],
        "dropoffZoneId": row["do_location_id"],
        "durationMin": row["trip_duration_min"],
        "distance": row["trip_distance"],
        "fare": row["fare_amount"],
    }

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
    where, values = build_filters(skip=("zoneId",))
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


SORT_COLUMNS = {
    "time": "t.pickup_datetime",
    "pickupZone": "z.zone",
    "dropoffZone": "d.zone",
    "duration": "t.trip_duration_min",
    "distance": "t.trip_distance",
    "fare": "t.fare_amount",
    "fareMile": "t.fare_per_mile",
}


@app.route("/api/trips")
def trips():
    """One page of trips for the table; filtered and sorted."""
    page = request.args.get("page", default=1, type=int)
    page_size = request.args.get("pageSize", default=10, type=int)
    page_size = max(1, min(page_size, 100))  # never more than 100 rows per page
    sort_by = request.args.get("sortBy", default="time")
    sort_dir = request.args.get("sortDir", default="asc")

    # only columns from the whitelist can reach the SQL
    sort_column = SORT_COLUMNS.get(sort_by, "t.pickup_datetime")
    direction = "DESC" if sort_dir == "desc" else "ASC"

    where, values = build_filters()
    joins = (
        "FROM trips t "
        "JOIN zones z ON t.pu_location_id = z.location_id "
        "LEFT JOIN zones d ON t.do_location_id = d.location_id "
    )
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) " + joins + where, values).fetchone()[0]

    total_pages = max(1, math.ceil(total / page_size))
    page = max(1, min(page, total_pages))  # too-high page -. last page
    offset = (page - 1) * page_size

    rows = conn.execute(
        "SELECT t.trip_id, t.pickup_datetime, t.pu_location_id, t.do_location_id, "
        "t.trip_duration_min, t.trip_distance, t.fare_amount "
        + joins + where +
        f" ORDER BY ({sort_column} IS NULL), {sort_column} {direction}, t.trip_id "
        "LIMIT ? OFFSET ?",
        values + [page_size,offset],
    ).fetchall()
    conn.close()

    result = []
    for row in rows:
        result.append({
            "id": row["trip_id"],
            "pickupTime": row["pickup_datetime"].replace(" ", "T"),
            "pickupZoneId": row["pu_location_id"],
            "dropoffZoneId": row["do_location_id"],
            "durationMin": row["trip_duration_min"],
            "distance": row["trip_distance"],
            "fare": row["fare_amount"],
        })
    return jsonify({"rows": result, "total": total, "page": page, "totalPages": total_pages})


@app.route("/api/fare-distance")
def fare_distance():
    """Sampled points for the scatter plot, plus a least-squares trend line."""
    max_points = request.args.get("maxPoints", default=2000, type=int)
    max_points = max(1, min(max_points, 5000))

    where, values = build_filters()
    qualifying = "t.fare_amount > 0 AND t.trip_distance >= 0.5"
    where = (where + " AND " + qualifying) if where else ("WHERE " + qualifying)
    joins = "FROM trips t JOIN zones z ON t.pu_location_id = z.location_id "

    conn = get_db()

    # 1. the five totals for the trend line, over ALL qualifying trips
    s = conn.execute(
        "SELECT COUNT(*) AS n, SUM(t.trip_distance) AS sx, SUM(t.fare_amount) AS sy, "
        "SUM(t.trip_distance * t.trip_distance) AS sxx, "
        "SUM(t.trip_distance * t.fare_amount) AS sxy "
        + joins + where,
        values,
    ).fetchone()
    total = s["n"]

    model = None
    if total >= 2:
        denominator = total * s["sxx"] - s["sx"] * s["sx"]
        if denominator != 0:
            slope = (total * s["sxy"] - s["sx"] * s["sy"]) / denominator
            intercept = (s["sy"] - slope * s["sx"]) / total
            model = {"slope": round(slope, 4), "intercept": round(intercept, 4)}

    # 2. an evenly spread, repeatable sample of points
    step = max(1, math.ceil(total / max_points))
    rows = conn.execute(
        "SELECT t.trip_id, t.trip_distance, t.fare_amount, z.borough "
        + joins + where +
        " AND t.trip_id % ? = 0 LIMIT ?",
        values + [step, max_points],
    ).fetchall()
    conn.close()

    points = []
    for row in rows:
        points.append({
            "id": row["trip_id"],
            "distance": row["trip_distance"],
            "fare": row["fare_amount"],
            "borough": row["borough"],
        })
    return jsonify({"points": points, "total": total, "model": model})


@app.route("/api/outliers")
def outliers():
    """Up to 20,000 trips for the frontend's Top-K heap (evenly sampled if more match)."""
    max_trips = 20_000
    where, values = build_filters()
    joins = "FROM trips t JOIN zones z ON t.pu_location_id = z.location_id "
    conn = get_db()

    matched = conn.execute("SELECT COUNT(*) " + joins + where, values).fetchone()[0]

    # every Nth trip: when fewer than max_trips match, step is 1 = all of them
    step = max(1, math.ceil(matched / max_trips))
    every_nth = "t.trip_id % ? = 0"
    sample_where = (where + " AND " + every_nth) if where else ("WHERE " + every_nth)

    rows = conn.execute(
        "SELECT t.trip_id, t.pickup_datetime, t.pu_location_id, t.do_location_id, "
        "t.trip_duration_min, t.trip_distance, t.fare_amount "
        + joins + sample_where + " LIMIT ?",
        values + [step, max_trips],
    ).fetchall()
    conn.close()

    sample = [trip_to_json(row) for row in rows]
    return jsonify({"trips": sample, "matched": matched, "sampled": len(sample)})



if __name__ == "__main__":
    app.run(debug=True, port=3000)
