from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
data_dir = root_dir 
output_dir = root_dir / "output"


trips_csv = data_dir / "yellow_tripdata_2019-01.csv"
trips_parquet = data_dir / "yellow_tripdata_2019-01.parquet"

zone_lookup = data_dir / "taxi_zone_lookup.csv"
zone_shapefile = data_dir / "taxi_zones" / "taxi_zones.shp"

# i keep processed output separate from the original sourec files

clean_trips = output_dir / "clean_trips.parquet"
rejected_trips = output_dir / "rejected_trips.csv"
clean_zones = output_dir / "zones.csv"
zone_geojson = output_dir /"taxi_zones.geojson"
quality_summary = output_dir / "quality_summary.json"



BATCH_SIZE = 200_000


COLUMN_NAMES = {
    "VendorID": "vendor_id",
    "tpep_pickup_datetime": "pickup_datetime",
    "tpep_dropoff_datetime": "dropoff_datetime",
    "RatecodeID": "rate_code_id",
    "PULocationID": "pu_location_id",
    "DOLocationID": "do_location_id",

}

DATATIME_COLUMNS =[
    "pickup_datetime",
    "dropoff_datetime",
]

INTEGER_COLUMNS =[
    "vendor_id",
    "passenger_count",
    "rate_code_id",
    "pu_location_id",
    "do_location_id",
    "payment_type",
]

FLOAT_COLUMNS = [
    "trip_distance",
    "fare_amount",
    "extra",
    "mta_tax",
    "tip_amount",
    "tolls_amount",
    "improvement_surcharge",
    "total_amount",
    "congestion_surcharge",

]


# i only reject a missing value when the field is necessary for the trip to remain useful for moblity analysis 

REQUIRED_COLUMNS = [
    "pickup_datetime",
    "dropoff_datetime",
    "trip_distance",
    "pu_location_id",
    "do_location_id",
    "fare_amount",
    "total_amount",
]

NON_NEGATIVE_CHARGES = [
    "extra",
    "mta_tax",
    "tip_amount",
    "tolls_amount",
    "improvement_surcharge",
]

PERIOD_START = "2019-01-01"
PERIOD_END = "2019-02-01"



MAX_DURATION_MIN =240
MAX_DISTANCE_MILES =100
MAX_FARE_USD = 500
MAX_SPEED_MPH =80


VALID_CODES = {
    "passenger_count": set(range(1,7)),
    "rate_code_id": set(range(1,7)),
    "payment_type": set(range(1,7),)
}


CREDIT_CARD_PAYMENT = 1