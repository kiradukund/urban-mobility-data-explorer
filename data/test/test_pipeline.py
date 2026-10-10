import pandas as pd

from data_processing import clean
from data_processing.pipeline import process_batch


VALID_ZONES = {
    7,
    25,
    107,
    132,
    141,
    151,
    161,
    170,
    229,
    234,
    236,
    237,
    239,
    246,
    264,
    265,
}


BASE_TRIP = {
    "VendorID": "1",
    "tpep_pickup_datetime":
        "2019-01-01 00:46:40",
    "tpep_dropoff_datetime":
        "2019-01-01 00:53:20",
    "passenger_count": "1",
    "trip_distance": "1.50",
    "RatecodeID": "1",
    "store_and_fwd_flag": "N",
    "PULocationID": "151",
    "DOLocationID": "239",
    "payment_type": "1",
    "fare_amount": "7",
    "extra": "0.5",
    "mta_tax": "0.5",
    "tip_amount": "1.65",
    "tolls_amount": "0",
    "improvement_surcharge": "0.3",
    "total_amount": "9.95",
    "congestion_surcharge": "",
}


def make_batch(**changes):
    return pd.DataFrame(
        [
            {
                **BASE_TRIP,
                **changes,
            }
        ],
        dtype=object,
    )


def run_trip(**changes):
    tracker = clean.DuplicateTracker()

    return process_batch(
        make_batch(**changes),
        VALID_ZONES,
        tracker,
    )


def test_valid_trip_is_kept():
    kept, rejected, _ = run_trip()

    assert len(kept) == 1
    assert rejected.empty


def test_expected_features_are_created():
    kept, _, _ = run_trip()

    trip = kept.iloc[0]

    assert trip["trip_duration_min"] == 6.67
    assert trip["avg_speed_mph"] == 13.5
    assert trip["fare_per_mile"] == 4.67
    assert trip["pickup_hour"] == 0
    assert trip["pickup_weekday"] == 1


def test_trip_outside_period_is_rejected():
    kept, rejected, _ = run_trip(
        tpep_pickup_datetime=
            "2018-11-28 15:52:25",
        tpep_dropoff_datetime=
            "2018-11-28 15:55:45",
    )

    assert kept.empty

    assert (
        rejected.iloc[0]["reject_reason"]
        == "pickup_outside_period"
    )


def test_zero_duration_is_rejected():
    kept, rejected, _ = run_trip(
        tpep_pickup_datetime=
            "2019-01-01 00:32:59",
        tpep_dropoff_datetime=
            "2019-01-01 00:32:59",
    )

    assert kept.empty

    assert (
        rejected.iloc[0]["reject_reason"]
        == "non_positive_duration"
    )


def test_zero_distance_is_rejected():
    kept, rejected, _ = run_trip(
        trip_distance="0"
    )

    assert kept.empty

    assert (
        rejected.iloc[0]["reject_reason"]
        == "non_positive_distance"
    )


def test_unknown_location_is_rejected():
    kept, rejected, _ = run_trip(
        DOLocationID="999"
    )

    assert kept.empty

    assert (
        rejected.iloc[0]["reject_reason"]
        == "unknown_location_id"
    )


def test_official_unknown_zone_is_not_treated_as_invalid():
    kept, rejected, _ = run_trip(
        DOLocationID="264"
    )

    assert len(kept) == 1
    assert rejected.empty


def test_invalid_category_is_repaired():
    kept, rejected, repaired = (
        run_trip(
            passenger_count="0"
        )
    )

    assert len(kept) == 1
    assert rejected.empty

    assert (
        repaired["passenger_count"]
        == 1
    )

    assert pd.isna(
        kept.iloc[0]["passenger_count"]
    )


def test_cash_payment_has_no_tip_percentage():
    kept, _, _ = run_trip(
        payment_type="2",
        tip_amount="0",
    )

    assert pd.isna(
        kept.iloc[0]["tip_pct"]
    )


def test_duplicate_inside_batch_is_rejected():
    tracker = clean.DuplicateTracker()

    raw = pd.concat(
        [
            make_batch(),
            make_batch(),
        ],
        ignore_index=True,
    )

    kept, rejected, _ = (
        process_batch(
            raw,
            VALID_ZONES,
            tracker,
        )
    )

    assert len(kept) == 1
    assert len(rejected) == 1

    assert (
        rejected.iloc[0]["reject_reason"]
        == "duplicate_record"
    )


def test_duplicate_across_batches_is_rejected():
    tracker = clean.DuplicateTracker()

    first_kept, _, _ = process_batch(
        make_batch(),
        VALID_ZONES,
        tracker,
    )

    second_kept, rejected, _ = (
        process_batch(
            make_batch(),
            VALID_ZONES,
            tracker,
        )
    )

    assert len(first_kept) == 1
    assert second_kept.empty

    assert (
        rejected.iloc[0]["reject_reason"]
        == "duplicate_record"
    )