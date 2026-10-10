import pandas as pd 
import pyarrow.parquet as pq


from . import config

def get_trip_source():
    if config.trips_parquet.exists():
        return config.trips_parquet

    if config.trips_csv.exists():
        return config.trips_csv

    raise FileNotFoundError(
        "i cound not find the yellow taxi trip dataset in the data directory"
    )



def read_trip_batches():
    source = get_trip_source()

    if source.suffix == ".parquet":
        parquet_file = pq.ParquetFile(source)

        for batch in parquet_file.iter_batches(
            batch_size=config.BATCH_SIZE
        ):
            yield batch.to_pandas()

        return

    yield from pd.read_csv (
        source,
        dtype=str,
        chunksize=config.BATCH_SIZE,
    )


def load_zone_lookup():
    zones = pd.read_csv(
        config.zone_lookup,
        keep_default_na=False,
    )

    required_columns = {
        "LocationID",
        "Borough",
        "Zone",
        "service_zone",
    }

    missing_columns = required_columns.difference(
        zones.columns
    )

    if missing_columns:
        raise ValueError(
            f"i found missing columns in taxi_zone_lookup.csv: {missing_columns}"
        )
    zones = zones.rename(
        columns={
            "LocationID": "location_id",
            "Borough": "borough",
            "Zone": "zone",
        }
    )

    zones["location_id"] = pd.to_numeric(
        zones["location_id"],
        errors="raise",
    ).astype(int)

    for column in [
        "borough",
        "zone",
        "service_zone",
    ]:  

        zones[column] = (
            zones[column]
            .astype(str)
            .str.strip()
        )
    if zones["location_id"].duplicated().any():
        raise ValueError(
            "i found duplication locationID value in the zoen lookup"
        )
    return zones 