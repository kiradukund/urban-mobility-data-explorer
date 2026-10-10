import json
import pyarrow as pa 
import pyarrow.parquet as pq  

from . import clean
from . import config
from . import features
from . import load 
from . import spatial



def process_batch(raw, valid_location_ids, duplicate_tracker,):
    
    duplicate_mask =(
        duplicate_tracker
        .find_duplicates(raw)
    )

    trips = clean.normalize(raw)

    repaired =(
        clean.repair_category_values(
            trips
        )
    )

    trips = features.add_features(
        trips
    )


    reasons = (
        clean.find_rejection_reason(
            trips,
            valid_location_ids,
        )
    )

    # i kept the more specific data quality reason when a deuplicate also have another invalid values


    reasons.loc[
        duplicate_mask 
        & reasons.eq("") 
    ] = "duplicate_record"

    valid_mask = reasons.eq("")


    kept = (
        trips.loc[valid_mask]
        .copy()
    )


    rejected =(
        raw.loc[~valid_mask]
        .copy()
    )

    rejected["reject_reason"] = (
        reasons.loc[~valid_mask]
        .values
    )

    return kept, rejected, repaired


def  append_rejected(rejected,first_write,):

    if rejected.empty:
        return first_write

    rejected.to_csv(
        config.rejected_trips,
        mode="w" if first_write else "a",
        header=first_write,
        index=False
    )

    return False


def update_counts(totals, rejected, repaired,):
    reason_counts = (
        rejected["reject_reason"]
        .value_counts()
    )

    for reason, count in reason_counts.items():
        totals["rejected_by_reason"][reason] = (
            totals["rejected_by_reason"].get(
                reason,
                0,
            )
            + int(count)
        )

    for column, count in repaired.items():
        totals["repaired_values"][column]=(
            totals["repaired_values"].get(
                column,
                0,
            )
            + int(count)
        )

def run():
    config.output_dir.mkdir(
        exist_ok=True
    )

    zones = load.load_zone_lookup()
    spatial.export_zone_lookup(
        zones
    )


    zones_with_geometry = (
        spatial.export_zone_boundaries(
            zones
        )
    )

    valid_location_ids = set(
        zones["location_id"]
    )

    duplicate_tracker = (
        clean.DuplicateTracker()
    )

    totals ={
        "rows_read":0,
        "rows_kept":0,
        "rejected_by_reason":{},
        "repaired_values":{},

    }

    parquet_writer =None
    parquet_schema=None
    first_rejected_write = True

    try:
        for batch_number, raw in enumerate(
            load.read_trip_batches(),
            start=1
        ):
            kept, rejected, repaired = (
                process_batch(
                    raw,
                    valid_location_ids,
                    duplicate_tracker,
                )
            )

            totals["rows_read"] += len(raw)
            totals["rows_kept"] += len(kept)

            update_counts(
                totals,
                rejected,
                repaired,
            )


            if not kept.empty:
                if parquet_schema is None:
                    table = pa.Table.from_pandas(
                        kept,
                        preserve_index=False
                    )

                    parquet_schema = table.schema

                    parquet_writer = (
                        pq.ParquetWriter(
                            config.clean_trips,
                            parquet_schema
                        )
                    )
                else:
                    table = pa.Table.from_pandas(
                        kept,
                        schema=parquet_schema,
                        preserve_index=False,
                    )

                parquet_writer.write_table(
                    table
                )

            first_rejected_write = (
                append_rejected(
                    rejected,
                    first_rejected_write
                )
            )

            rejected_so_far = (
                totals["rows_read"] - totals["rows_kept"]
            )

            print(
                f"batch {batch_number}: "
                f"{totals['rows_read']:,} read, "
                f"{totals['rows_kept']:,} kept, "
                f"{rejected_so_far:,} rejected"
            )

    finally:
        if parquet_writer is not None:
            parquet_writer.close()

    rejected_row =(
        totals["rows_read"] - totals["rows_kept"]
    )
    

    rejected_pct =(
        round(
            rejected_row / totals["rows_read"] * 100, 2
        )
        if totals["rows_read"]
        else 0
    )


    summary ={
        "totals_row": totals["rows_read"],
        "kept_row": totals["rows_kept"],
        "rejected_row": rejected_row,
        "rejected_pct":rejected_pct,
        "rejected_by_reason":
            totals["rejected_by_reason"],
        "values_set_to_missing":
            totals["repaired_values"],
        "zone_in_lookup": len(zones),
        "zone_with_geometry":
            zones_with_geometry,
        "features_created": [
            "trip_duration_min",
            "avg_speed_mph",
            "fare_per_mile",
            "tip_pct",
            "pickup_hour",
            "pickup_weekday",
        ],
        "cleaning_limits":{
            "max_duration_min":
                config.MAX_DURATION_MIN,
            "max_distance_miles":
                config.MAX_DISTANCE_MILES,
            "max_fare_usd":
                config.MAX_FARE_USD,
            "max_speed_mph":
                config.MAX_SPEED_MPH,
        
        },
            
    }


    config.quality_summary.write_text(
        json.dumps(
            summary,
            indent=2
        ),
        encoding="utf-8",
    )

    return summary


if __name__ =="__main__":
    result = run()


    print(
        json.dumps(
            result,
            indent=2,
        )
    ) 



    



