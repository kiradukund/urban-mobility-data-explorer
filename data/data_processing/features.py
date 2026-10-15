from . import  config




def safe_divide(numerator, denominator ):
    return numerator / denominator.where(
        denominator > 0
    )

def add_features(trips):
    trips = trips.copy()


    duration = (
        trips["dropoff_datetime"]
        - trips["pickup_datetime"]
    )

    trips["trip_duration_min"] = (
        duration.dt.total_seconds() / 60
    )


    trips["avg_speed_mph"] = safe_divide(
        trips["trip_distance"],
        trips["trip_duration_min"] / 60,
    )

    trips["fare_per_mile"] = safe_divide(
        trips["fare_amount"],
        trips["trip_distance"],
    )


    tip_percentage =(
        safe_divide(
            trips["tip_amount"],
            trips["fare_amount"],

        )
        * 100
    )

    card_payment = (
        trips["payment_type"] == config.CREDIT_CARD_PAYMENT
        
    )

    trips["tip_pct"] = tip_percentage.where(
        card_payment
    )

    trips["pickup_hour"] =(
        trips["pickup_datetime"]
        .dt.hour
        .astype("Int64")
    )

    trips["pickup_weekday"] =(
        trips["pickup_datetime"]
        .dt.weekday
        .astype("Int64")
    )

    decimal_columns = [
        "trip_duration_min",
        "avg_speed_mph",
        "fare_per_mile",
        "tip_pct",
    ]


    trips[decimal_columns]= (
        trips[decimal_columns]
        .round(2)
    )

    return trips