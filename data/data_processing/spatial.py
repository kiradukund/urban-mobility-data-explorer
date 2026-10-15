import  geopandas as gpd 
from . import  config


def export_zone_lookup(zones):
    zones.to_csv(
        config.clean_zones,
        index=False,

    )

def export_zone_boundaries(zones):
    shapes = gpd.read_file(
        config.zone_shapefile
    )

    if "LocationID" not  in shapes.columns:
        raise ValueError(
            " i cound not find LocationID in the taxi zone shapefile"
        )
    shapes = shapes.rename(
        columns={
            "LocationID": "location_id",

        }
    )

    shapes["location_id"] = (
        shapes["location_id"].astype(int)
    )

    # i kept the names from the lookup table as the source of truth and use the shapefile only for the locationID and geometry


    shapes = (
        shapes[
            [
            "location_id",
            "geometry"

            ]
        ]
        .dissolve(by="location_id")
        .reset_index()

    )

    if shapes.crs is None:
        raise ValueError(
            " i cound not determine the shapefile coordinate system"
        )

    # the shapefile is in NY State Plane feet, web maps need latitude/longitude (EPSG:4326)
    shapes = shapes.to_crs(epsg=4326)

    boundaries = shapes.merge(
        zones,
        on="location_id",
        how="inner",
        validate="one_to_one",

    )

    boundaries.to_file(
        config.zone_geojson,
        driver="GeoJSON",
    )

    return len(boundaries)