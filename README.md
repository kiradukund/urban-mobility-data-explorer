
## Frontend Dashboard

An interactive, dependency-free dashboard (HTML, CSS, JavaScript) for exploring NYC Yellow Taxi trips. It runs in two modes: on a small **mock dataset** with no backend, or on the **live backend API**.

### 1. What the dashboard shows

| Section | What you see |
|---|---|
| **City Pulse** | Total trips, average fare, average distance, fare per mile, and the busiest hour of the day |
| **24-hour rhythm** | Trips per pickup hour; click a bar to filter the whole dashboard to that hour |
| **Patterns** | Average fare by hour, and the top pickup zones (click a zone to filter) |
| **Relationships** | Fare × distance scatter plot with a least-squares trend line, optionally coloured by borough |
| **Outliers** | Top 10 trips that are most unusual for their distance, or simply the most expensive |
| **Evidence** | Sortable, paginated trip table; click a row (or press Enter) for full trip details |

Filters (borough, pickup zone, hour range, fare range, distance range) apply to every section at once. Active filters appear as removable chips, and **Reset** clears them all. The layout adapts to desktop, tablet and phone widths.

### 2. Files

The frontend lives on the `feature/frontend-ui` branch:

```
urban-mobility-data-explorer/
├── index.html            # page structure and sections
├── styles.css            # design tokens, layout, responsive rules
├── app.js                # state, filters, calculations, rendering, data source switch
├── charts.js             # rhythm bars, fare-by-hour line chart, zone list, scatter plot
├── algorithms.js         # hand-written min-heap and Top-K
├── mock/
│   └── mock_data.json    # small development dataset
└── docs/                 # design notes
```

Scripts load in this order at the end of `index.html`: `algorithms.js` → `charts.js` → `app.js`.

### 3. Requirements

- A modern browser (Chrome, Edge or Firefox)
- **One** of these to serve the files:
  - **VS Code** with the **Live Server** extension, or
  - **Python 3** (for its built-in web server)

No npm, no build step, no libraries.

### 4. Get the code

```bash
git clone https://github.com/kiradukund/urban-mobility-data-explorer.git
cd urban-mobility-data-explorer
git switch feature/frontend-ui
```

### 5. Choose the data source

At the top of `app.js`:

```js
const config = {
  mockDataPath: "mock/mock_data.json",
  loadDelayMs: 0,
  useMockData: true,                       // true = mock data, false = live API
  apiBaseUrl: "http://localhost:3000/api"  // where the backend runs
};
```

| Mode | Setting | Needs the backend? |
|---|---|---|
| **Mock** | `useMockData: true` | No. Reads `mock/mock_data.json` and shows a "Development placeholder data" badge |
| **Live API** | `useMockData: false` | Yes. Start the backend first (see the Backend section) |

Charts, table and drawer work the same in both modes. Only the data source changes.

### 6. Run the dashboard

**Option A: VS Code Live Server**
1. Open the project folder in VS Code.
2. Open `index.html`.
3. Click **Go Live** (bottom-right of the status bar).
4. The browser opens **http://127.0.0.1:5500/index.html**.

**Option B: Python**

From the project root:

```bash
python -m http.server 5500
```

Then open **http://localhost:5500**. Press `Ctrl+C` in the terminal to stop it.

> ⚠ **Do not open `index.html` by double-clicking it.** Browsers block `fetch()` on `file://` pages, so the dashboard shows "Trip data could not be loaded".

### 7. Check that it works

1. Press **F12 → Console**: there should be no red errors.
2. The filter bar shows the number of matching trips (e.g. "20 trips match" in mock mode).
3. Click an hour bar, a zone, a table row (the trip drawer opens; **Escape** closes it) and the **Most expensive** lens.
4. Choose filters that match nothing (e.g. Fare "Over $60" + Distance "Under 2 mi"): every chart shows a "No trips match" message and a **Reset filters** button.
5. Press **Ctrl+Shift+M** in DevTools to check the phone layout.

### 8. Custom algorithm: Top-K with a min-heap

The **Outliers** section ranks trips with a hand-written **min-heap** (`algorithms.js`), with no built-in sort and no library heap.

- One pass over the matching trips keeps only the **K** strongest (K = 10): **O(n log k)** time and **O(k)** extra space, instead of sorting everything in O(n log n).
- **Unusual for distance:** score = fare − expected fare from a least-squares trend line. The line is fitted only on trips of 0.5 miles or more, but every trip with a fare and distance is scored, so very short, very expensive trips are found.
- **Most expensive:** score = fare.
- **Ties:** equal scores rank the smaller trip id first, so the result is always the same.
- Trips with a missing fare or distance are skipped and counted as excluded.

Pseudo-code and complexity analysis are in the technical report.

### 9. Mock data

`mock/mock_data.json` has the same shape as the API responses:

```json
{
  "meta":  { "isMock": true, "periodStart": "2024-01-08", "periodEnd": "2024-01-14" },
  "zones": [ { "id": 1, "name": "Midtown Center", "borough": "Manhattan" } ],
  "trips": [ { "id": 1001, "pickupTime": "2024-01-12T17:09:00", "pickupZoneId": 3,
               "dropoffZoneId": 4, "durationMin": 9, "distance": 1.5, "fare": 9.36 } ]
}
```

Missing values are `null`, never `0`, so averages and sorting skip them instead of treating them as real zeros. Every number in mock mode is a development placeholder, not a finding about New York.

### 10. Troubleshooting

| Problem | Fix |
|---|---|
| "Trip data could not be loaded" | Page opened as `file://`, or `useMockData: false` with no backend running. Use step 6, or switch to mock mode |
| Red **CORS** error in the console | The backend must be running and allow the frontend's origin (`http://127.0.0.1:5500` / `http://localhost:5500`) |
| `Cannot set properties of null` in the console | An `id` in `index.html` doesn't match the one `app.js` looks for |
| Page looks unstyled | `styles.css` not found. Serve from the project root, not from a subfolder |
| Port 5500 already in use | Close the other server, or use another port (e.g. `python -m http.server 5501`) |
