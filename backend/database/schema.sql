-- uraban mobility data explorer, sqlite schema
-- the star schema, one fact table (trips) + four lockups tables

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS trips;
DROP TABLE IF EXISTS zones;
DROP TABLE IF EXISTS vendors;
DROP TABLE IF EXISTS payment_types;
DROP TABLE IF EXISTS rate_codes;

-- lockup (dimension) tables

CREATE TABLE zones (
    location_id INTEGER PRIMARY KEY,
    borough             TEXT NOT NULL,
    zone                TEXT,
    service_zone        TEXT
);

CREATE TABLE vendors(
    vendor_id INTEGER PRIMARY KEY,
    vendor_name TEXT NOT NULL
);

CREATE TABLE payment_types(
    payment_type_id INTEGER PRIMARY KEY,
    description     TEXT NOT NULL
);

CREATE TABLE rate_codes(
    rate_code_id INTEGER PRIMARY KEY,
    description TEXT NOT NULL
);

INSERT INTO vendors VALUES
    (1, 'Creative Mobile Technologies'),
    (2, 'VeriFone');

INSERT INTO payment_types VALUES
    (1, 'Credit card'), (2, 'Cash'), (3, 'No charge'),
    (4, 'Dispute'), (5, 'Unknown'), (6, 'Voided trip');

INSERT INTO rate_codes VALUES
    (1, 'Standard rate'), (2, 'JFK'), (3, 'Newark'),
    (4, 'Nassau or Westenchester'), (5, 'Negotiated fare'), (6, 'Group ride');


--fact table


CREATE TABLE trips(
    trip_id               INTEGER PRIMARY KEY AUTOINCREMENT,
    vendor_id             INTEGER NOT NULL REFERENCES vendors(vendor_id),
    pickup_datetime       TEXT    NOT NULL,
    dropoff_datetime      TEXT    NOT NULL,
    passenger_count       INTEGER,
    trip_distance         REAL    NOT NULL,
    rate_code_id          INTEGER REFERENCES rate_codes(rate_code_id),
    store_and_fwd_flag    TEXT    CHECK (store_and_fwd_flag IN ('Y', 'N')),
    pu_location_id        INTEGER NOT NULL REFERENCES zones(location_id),
    do_location_id        INTEGER NOT NULL REFERENCES zones(location_id),
    payment_type_id       INTEGER NOT NULL REFERENCES payment_types(payment_type_id),
    fare_amount           REAL    NOT NULL,
    extra                 REAL,
    mta_tax               REAL,
    tip_amount            REAL,
    tolls_amount          REAL,
    improvement_surcharge REAL,
    total_amount          REAL     NOT NULL,
    congestion_surcharge  REAL,
    -- derived features (computed by the data pipeline)
    trip_duration_main    REAL     NOT NULL,
    avg_speed_main        REAL,
    fare_per_mile         REAL,
    tip_pct               REAL,
    pickup_hour           INTEGER  NOT  NULL CHECK (pickup_hour BETWEEN 0 AND 23),
    pickup_weekday        INTEGER  NOT  NULL CHECK (pickup_weekday BETWEEN 0 AND 6),
    CHECK (dropoff_datetime >= pickup_datetime)
);

-- indexes


CREATE INDEX idx_trips_pickup_datetime ON trips(pickup_datetime);
CREATE INDEX idx_trips_pu_location     ON trips(pu_location_id);
CREATE INDEX idx_trips_do_location     ON trips(do_location_id);
CREATE INDEX idx_trips_weekday_hour    ON trips(pickup_weekday, pickup_hour);
