import pandas as pd
from . import config



def normalize(raw):
    trips = raw.rename(
        columns=config.COLUMN_NAMES
    ).copy()


    # i create optional numeric field when an older source file does not contain them so the cleaned schema remain consistent 
    for column in config.FLOAT_COLUMNS:
        if column not in trips.columns:
            trips[column] = pd.NA

    
    for column in config.DATATIME_COLUMNS:
        trips[column]= pd.to_datetime(
            trips[column],
            format="%Y-%m-%d %H:%M:%S",
            errors="coerce",
        )

    for column in config.FLOAT_COLUMNS:
        trips[column] =pd.to_numeric(
            trips[column],
            errors="coerce"
        )
    
    for column in config.INTEGER_COLUMNS:
        trips[column] =(
            pd.to_numeric(
                trips[column],
                errors="coerce",

            )
            .round()
            .astype("Int64")
        )

    trips["store_and_fwd_flag"] =(
        trips["store_and_fwd_flag"]
        .astype("string")
        .str.strip()
        .str.upper()
    )

    trips["congestion_surcharge"] = (
        trips["congestion_surcharge"]
        .fillna(0)
    )
    return trips 


def repair_category_values(trips):
    repaired = {}

    for column, allowed_values in config.VALID_CODES.items():
        invalid = (
            trips[column].notna()
            & ~trips[column].isin(
                allowed_values
            )
        )

        repaired[column] = int(
            invalid.sum()
        )
        
        trips.loc[
            invalid,
            column,
        ] = pd.NA

    return repaired

def find_rejection_reason(
    trips,
    valid_location_ids,
):
    reasons = pd.Series(
        "",
        index=trips.index,
        dtype="string",
    )

    def reject(mask, reason):
        unresolved = reasons.eq("")

        reasons.loc[
            unresolved
            & mask.fillna(False)
        ] = reason

    reject(
        trips[
            config.REQUIRED_COLUMNS
        ].isna().any(axis=1),
        "missing_required_field",
    )

    pickup = trips["pickup_datetime"]

    in_period = (
        (pickup >= config.PERIOD_START) 
        & (pickup < config.PERIOD_END)
    )

    reject(
        ~in_period,
        "pickup_outside_period"
        
    )

    reject(
        trips["trip_duration_min"] <= 0,
        "non_positive_duration",
    )

    reject(
        trips["trip_duration_min"]
        > config.MAX_DURATION_MIN,
        "duration_over_limit"

    )

    reject(
        trips["trip_distance"] <= 0,
        "non_positive_distance",

    )

    reject(
        trips["trip_distance"]
        > config.MAX_DISTANCE_MILES,
        "distance_over_limit"
    )

    invalid_fare =(
        (trips["fare_amount"]<=0)
        | (trips["total_amount"]<=0)
    )

    reject(
        invalid_fare,
        "non_positive_fare",
    )

    reject(
        trips["fare_amount"]
        > config.MAX_FARE_USD,
        "fare_over_limit",
    )


    negative_charge =(
        trips[config.NON_NEGATIVE_CHARGES] < 0
    ).any(axis=1)


    reject(
        negative_charge,
        "negative_charges",
    )

    known_location =(
        trips["pu_location_id"].isin(
            valid_location_ids
        )
        & trips["do_location_id"].isin(
            valid_location_ids
        )
    )

    reject(
        ~known_location,
        "unknown_location_id",
    )

    reject(
        trips["avg_speed_mph"]
        > config.MAX_SPEED_MPH,
        "implausible_speed",

    )

    return reasons



class DuplicateTracker:
    def __init__(self):
        self._seen = set ()

    #i kept row hashes instand if complete row so duplicate tracking uses less memory
    def find_duplicates(self, raw):
        hashes = pd.util.hash_pandas_object(
            raw,
            index=False,
        )

        duplicate_flags = []

        for row_hash in hashes:

            if row_hash in self._seen:
                duplicate_flags.append(True)
            else:
                self._seen.add(row_hash)
                duplicate_flags.append(False)
        
        return pd.Series(
            duplicate_flags,
            index=raw.index,
        )