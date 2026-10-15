<!-- Documentation -->
# API contract 
Base URL during development: http://localhost:3000/api
ALL response are JSON, Numbers are numbers (not text). Missing values are null.
## shared filter paramaters (all optional)
| parameter     | Type             | Meaning                                                |
|----------------|------------------|--------------------------------------------------------|
| borough        |   text            |   pickup borough, for example Manhattan                |
| zoneId         |   integer         | pickup zone id                                         |
| hourFrom       |  0-23             | First pickup hour (inclusive)                          |
| hourTo         |  0-23             | last pickup hour (inclusive)                           |
| fareMin        | number            | fare at least this (dollars)                           |
| fareMax        | number            | fare below this (dollars)                              |
| distanceMin    | number            | Distance at least this (miles)                         |
| distanceMax    | number            | Distance below this (miles)                            |
A missing parameter means "no restriction". ALL filters combine with AND.
pickup time is a local time text such as 2024-01-08T16:52:00 (no time zone).
## Trip object
   { "id": 1011, "pickupTime": "2024-01-08T16:52:00", "pickupZoneId": 16,
     "dropoffZoneId": 11, "durationMin": 21, "distance": 2.4, "fare": 126.0 }
Null is allowed in dropoffZoneId, durationMin, distance and fare.
## Endpoints
Get /meta
  { 'isMock": false, "periodStart": "2024-01-08", "periodEnd": "2024-01-14" }
GET /zones
  [ {  "id": 1, "name": "Midtown center", "borough": "Manhattan"}]
GET /summary                     (all filters)
  { "totalTrips": 123456, "avgFare": 18.4, "avgDistance": 4.8, "fareMile": 3.83}
  avgFare, avgDistance and fareMile are null when totalTrips is 0.
GET /trips-by-hour                             (all filters EXCEPT hourfrom and hourTo)
   { "hourly": [ 24 integers, index 0 = midnight hour , zeros included] }
GET /fare-by-hour                             (all filters EXCEPT hourFrom and hourTo)
   { "fareByhour": [ 24 numbers, null for an hour with no fares ] }
GET /top-zones?limit=8      (all filters EXCEPT zoneID)
   { "zones": [ { "zoneID": 1, "name": "Midtown Center", "borough": "Manhattan",
                   "trips": 158700, "share": 12.8, "avgFare": 16.8 } ] }
   sorted by trips, largest first. share is a percentage of the trips matching the filters.
GET /fare-distance?maxPoints=2000    (all filters)
   { "points": [ { "id": 1011, "distance": 2.4, "fare": 126.0, "borough": "Manhattan" } ],
      "total": 118000,
      "model": { "slope": 2.8, "intercept": 3.5 } }
   Only qualifying trips (fare > 0, distance >= 0.5 mile). points is a sample of at most
   maxpoints. total is the number of qualifying trips before sampling.
   model is the least-squares line fare = intercept + slope * distance, or null.
GET /outliers?lens=unusual&k=10     (all filters)
   lens is "unusual" (fare minus the model's expected fare) or "expensive" (the fare).
        { "entries": [{ "score": 187.4, "item": {...trip object... } } ],
          "scanned": 125000, "qualifying":118000, "excluded": 7000, "elapsedMs":340 }
    entries are strongest first, at most k of them.
GET /trips?page=1&pageSize=10&sortBy=time&sortDir=asc    (all filters)
    sortBy is one of: time, pickupZone, dropoffZone, duration, distance, fare, fareMile
    sortDir is asc or desc. Trips with a missing sort value come last in both directions.
    { "rows": [...trip objects...], "total": 118000, "page": 1,"totalpages": 11800}
    page is counted from 1. If the pages is too high, return the last page.
## Errors
Status 400 for invalid paramaters, 500 for server problems.body.
    { "error": { "code": "BAD_PARAMETER", "message":"hourFrom must be 0-23"} }
## NULL behaviour
Missing values are always null, never 0 and never an empty text.
## CORS
the frontend runs on a different origin (for example http://127.0.0/1:5500 with live Server),
so the backend must send Access-control-Allow-Origin for that origin during development.
## pagination
only /trips is paginated (page, pageSize). Everything else returns bounded resoults.