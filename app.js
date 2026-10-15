// Application logic [I'm going to load the mock file i just created with fetch when the page is ready and i will confirm the data arrives.]
const config = {
    mockDataPath: "mock/mock_data.json",
    loadDelayMs: 0,
    useMockData: true,
    apiBaseUrl: "http://localhost:3000/api"
};
const DEFAULT_FILTERS = {
    borough: "all",
    zone: "all",
    hourFrom: 0,
    hourTo: 23,
    fare: "all",
    distance: "all",
};
const state = {
    status: "loading",
    meta: null,
    zones: [],
    zoneById: {},
    allTrips: [],
    filteredTrips: [],
    filters: { ...DEFAULT_FILTERS },
    view: null,
    table: { page: 1, pageSize: 10, sortBy: "time", sortDir: "asc" },
    selectedTripId: null,
    outlierLens: "unusual",
    colorByBorough: false
};
async function loadMockData() {
    const response = await fetch(config.mockDataPath);
    if (!response.ok) {
        throw new Error("Could not load " + config.mockDataPath + " (status " + response.status + ")");
    }
    return response.json();
}
async function initDashboard() {
    try {
        setStatus("loading");
        await delay(config.loadDelayMs);



        const data = await loadStartupData();
        state.meta = data.meta;
        state.zones = data.zones;
        state.allTrips = data.trips;
        state.zoneById = buildZoneLookup(data.zones);
        populateFilterControls();
        setupFilterControls();


        setupScatterControls();


        setupOutlierControls();

        setupTableSelection();

        setupDrawer();

        setupPagination();

        setupTableSorting();
        applyFilters();
    } catch (error) {
        console.error("Dashboard failed to start:", error);
        setStatus("error", "Trip data could not be loaded. " + error.message);
    }
}
document.addEventListener("DOMContentLoaded", initDashboard);


function buildZoneLookup(zones) {
    const lookup = {};
    for (const zone of zones) {
        lookup[zone.id] = zone;
    }
    return lookup;
}
function getZoneName(zoneId) {
    const zone = state.zoneById[zoneId];
    return zone ? zone.name : "Unknown";
}
function getZoneBorough(zoneId) {
    const zone = state.zoneById[zoneId];
    return zone ? zone.borough : "Unknown";
}

function formatHour(hour) {
    const suffix = hour < 12 ? "AM" : "PM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return displayHour + " " + suffix;
}
function parseRange(value) {
    if (value === "all") {
        return { min: 0, max: Infinity };
    }
    if (value.endsWith("+")) {
        return { min: Number(value.slice(0, -1)), max: Infinity };
    }
    const parts = value.split("-");
    return { min: Number(parts[0]), max: Number(parts[1]) };
}
function getHour(trip) {
    return Number(trip.pickupTime.slice(11, 13));
}
function isInRange(value, rangeKey) {
    if (rangeKey === "all") {
        return true;
    }
    if (value === null) {
        return false;
    }
    const range = parseRange(rangeKey);
    return value >= range.min && value < range.max;
}
function tripMatches(trip, filters, ignore) {
    if (filters.borough !== "all") {
        const zone = state.zoneById[trip.pickupZoneId];
        if (!zone || zone.borough !== filters.borough) {
            return false;
        }
    }
    if (ignore !== "zone" && filters.zone !== "all" && trip.pickupZoneId !== filters.zone) {
        return false;
    }
    if (ignore !== "hour") {
        const hour = getHour(trip);
        if (hour < filters.hourFrom || hour > filters.hourTo) {
            return false;
        }
    }
    return isInRange(trip.fare, filters.fare) && isInRange(trip.distance, filters.distance);
}
function filterTrips(trips, filters, ignore) {
    return trips.filter(trip => tripMatches(trip, filters, ignore));
}
const controls = {}
function populateFilterControls() {
    controls.borough = document.getElementById("filter-borough");
    controls.zone = document.getElementById("filter-zone");
    controls.hourFrom = document.getElementById("filter-hour-from");
    controls.hourTo = document.getElementById("filter-hour-to");
    controls.fare = document.getElementById("filter-fare");
    controls.distance = document.getElementById("filter-distance");
    controls.reset = document.getElementById("filter-reset");
    fillZoneOptions();
    fillHourOptions();
}
function fillZoneOptions() {
    const sortedZones = [...state.zones].sort((a, b) => a.name.localeCompare(b.name));
    for (const zone of sortedZones) {
        const option = document.createElement("option");
        option.value = zone.id;
        option.textContent = zone.name;
        controls.zone.appendChild(option);
    }
}
function fillHourOptions() {
    controls.hourFrom.innerHTML = "";
    controls.hourTo.innerHTML = "";
    for (let hour = 0; hour < 24; hour++) {
        const fromOption = document.createElement("option");
        fromOption.value = hour;
        fromOption.textContent = formatHour(hour);
        controls.hourFrom.appendChild(fromOption);
        const toOption = document.createElement("option");
        toOption.value = hour;
        toOption.textContent = formatHour((hour + 1) % 24);
        controls.hourTo.appendChild(toOption);
    }
    controls.hourTo.value = String(DEFAULT_FILTERS.hourTo);
}
function setupFilterControls() {
    const filterControls = [controls.borough, controls.zone, controls.hourFrom, controls.hourTo, controls.fare, controls.distance];
    filterControls.forEach(control => control.addEventListener("change", handleFilterChange));

    controls.reset.addEventListener("click", resetFilters);
}
function readFiltersFromControls() {
    state.filters.borough = controls.borough.value;
    state.filters.zone = controls.zone.value === "all" ? "all" : Number(controls.zone.value);
    state.filters.hourFrom = Number(controls.hourFrom.value);
    state.filters.hourTo = Number(controls.hourTo.value);
    state.filters.fare = controls.fare.value;
    state.filters.distance = controls.distance.value;
}
function syncControlsFromState() {
    controls.borough.value = state.filters.borough;
    controls.zone.value = String(state.filters.zone);
    controls.hourFrom.value = String(state.filters.hourFrom);
    controls.hourTo.value = String(state.filters.hourTo);
    controls.fare.value = state.filters.fare;
    controls.distance.value = state.filters.distance;
}
function handleFilterChange(event) {
    readFiltersFromControls();
    if (state.filters.hourFrom > state.filters.hourTo) {
        if (event.target === controls.hourFrom) {
            state.filters.hourTo = state.filters.hourFrom;
        } else {
            state.filters.hourFrom = state.filters.hourTo;
        }
        syncControlsFromState();
    }
    applyFilters();
}
function applyFilters() {
    state.table.page = 1;
    state.filteredTrips = filterTrips(state.allTrips, state.filters);
    renderDashboard();
}
async function renderDashboard() {
    try {
        const view = await getView();
        state.view = view;
    } catch (error) {
        console.error("failed to get view:", error);
        setStatus("error", "could not load dashboard view.");
        return;
    }

    updateFilterCount(state.view.summary.totalTrips);

    renderFilterChips();

    renderPulse(state.view);

    renderRhythmChart(state.view);

    renderFareByHourChart(state.view);

    renderZoneList(state.view);

    renderScatterChart(state.view);

    renderOutliers(state.view);

    renderTable(state.view);

    renderPagination(state.view);


    setStatus(state.view.summary.totalTrips === 0 ? "empty" : "ready");

    updateSortIndicators();
}
function updateFilterCount(count) {
    const label = count === 1 ? " trip matches" : " trips match";
    document.getElementById("filter-count").textContent = count.toLocaleString("en-US") + label;
}


function resetFilters() {
    state.filters = { ...DEFAULT_FILTERS };
    syncControlsFromState();
    applyFilters();
}

function getSelectedLabel(select) {
    return select.options[select.selectedIndex].text;
}
function isHourFilterActive() {
    return state.filters.hourFrom !== DEFAULT_FILTERS.hourFrom || state.filters.hourTo !== DEFAULT_FILTERS.hourTo;
}
function describeHourFilter() {
    const from = formatHour(state.filters.hourFrom);
    const until = formatHour((state.filters.hourTo + 1) % 24);
    if (state.filters.hourFrom === state.filters.hourTo) {
        return "Pickup hour: " + from;
    }
    return "Pickup hours: " + from + " to " + until;
}
function getActiveFilters() {
    const active = [];
    const filters = state.filters;
    if (filters.borough !== DEFAULT_FILTERS.borough) {
        active.push({ key: "borough", label: filters.borough });
    }
    if (filters.zone !== DEFAULT_FILTERS.zone) {
        active.push({ key: "zone", label: "Zone: " + getZoneName(filters.zone) });
    }
    if (isHourFilterActive()) {
        active.push({ key: "hour", label: describeHourFilter() });
    }
    if (filters.fare !== DEFAULT_FILTERS.fare) {
        active.push({ key: "fare", label: "Fare: " + getSelectedLabel(controls.fare) });
    }
    if (filters.distance !== DEFAULT_FILTERS.distance) {
        active.push({ key: "distance", label: "Distance: " + getSelectedLabel(controls.distance) });
    }
    return active;
}
function renderFilterChips() {
    const list = document.getElementById("filter-chip-list");
    const emptyMessage = document.getElementById("filter-chips-empty");
    const activeFilters = getActiveFilters();
    list.innerHTML = "";
    emptyMessage.hidden = activeFilters.length > 0;
    for (const filter of activeFilters) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip";
        button.textContent = filter.label + " \u00d7";
        button.setAttribute("aria-label", "Remove filter: " + filter.label);
        button.addEventListener("click", () => removeFilter(filter.key));
        item.appendChild(button);
        list.appendChild(item);
    }
}
function removeFilter(key) {
    if (key === "hour") {
        state.filters.hourFrom = DEFAULT_FILTERS.hourFrom;
        state.filters.hourTo = DEFAULT_FILTERS.hourTo;
    } else {
        state.filters[key] = DEFAULT_FILTERS[key];
    }
    syncControlsFromState();
    applyFilters();
}


const EMPTY_VALUE = "\u2013";
const DASH = "\u2013";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function formatMoney(value) {
    if (value === null) {
        return EMPTY_VALUE;
    }
    return "$" + value.toFixed(2);
}
function formatMiles(value) {
    if (value === null) {
        return EMPTY_VALUE;
    }
    return value.toFixed(1) + " mi";
}
function formatCount(value) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}
function formatWindow(startHour) {
    const endHour = (startHour + 2) % 24;
    const startLabel = formatHour(startHour);
    const endLabel = formatHour(endHour);
    if (startLabel.slice(-2) === endLabel.slice(-2)) {
        return startLabel.slice(0, -3) + DASH + endLabel;
    }
    return startLabel + DASH + endLabel;
}
function describePeriod(meta) {
    const start = meta.periodStart.split("-").map(Number);
    const end = meta.periodEnd.split("-").map(Number);
    const startMonth = MONTH_NAMES[start[1] - 1];
    const endMonth = MONTH_NAMES[end[1] - 1];
    if (start[0] !== end[0]) {
        return startMonth + " " + start[2] + ", " + start[0] + " " + DASH + " " + endMonth + " " + end[2] + ", " + end[0];
    }
    if (start[1] === end[1]) {
        return startMonth + " " + start[2] + DASH + end[2] + ", " + end[0];
    }
    return startMonth + " " + start[2] + " " + DASH + " " + endMonth + " " + end[2] + ", " + end[0];
}

function average(values) {
    const usable = values.filter(value => value !== null);
    if (usable.length === 0) {
        return null;
    }
    let total = 0;
    for (const value of usable) {
        total += value;
    }
    return total / usable.length;
}
function calculateSummary(trips) {
    let fareTotal = 0;
    let distanceTotal = 0;
    for (const trip of trips) {
        if (trip.fare !== null && trip.distance !== null && trip.distance > 0) {
            fareTotal += trip.fare;
            distanceTotal += trip.distance;
        }
    }
    return {
        totalTrips: trips.length,
        avgFare: average(trips.map(trip => trip.fare)),
        avgDistance: average(trips.map(trip => trip.distance)),
        fareMile: distanceTotal > 0 ? fareTotal / distanceTotal : null
    };
}
function countTripsByHour(trips) {
    const counts = new Array(24).fill(0);
    for (const trip of trips) {
        counts[getHour(trip)] += 1;
    }
    return counts;
}
function findPeak(counts) {
    let peakHour = 0;
    for (let hour = 1; hour < 24; hour++) {
        if (counts[hour] > counts[peakHour]) {
            peakHour = hour;
        }
    }
    let windowStart = peakHour;
    if (peakHour === 23) {
        windowStart = 22;
    } else if (peakHour > 0 && counts[peakHour - 1] > counts[peakHour + 1]) {
        windowStart = peakHour - 1;
    }
    return {
        peakHour: peakHour,
        windowStart: windowStart,
        windowCount: counts[windowStart] + counts[windowStart + 1]
    };
}
function buildView() {
    const hourContext = filterTrips(state.allTrips, state.filters, "hour");
    const hourly = countTripsByHour(hourContext);


    const fareModel = fitFareModel(state.filteredTrips);

    const outliers = calculateOutliers(state.filteredTrips, fareModel, state.outlierLens);


    const zoneContext = filterTrips(state.allTrips, state.filters, "zone");
    return {
        summary: calculateSummary(state.filteredTrips),


        outliers: outliers,
        outlierIds: new Set(outliers.entries.map(entry => entry.item.id)),


        table: buildTablePage(),


        scatter: buildScatter(state.filteredTrips, fareModel),
        fareModel: fareModel,

        zones: calculateTopZones(zoneContext, TOP_ZONE_COUNT),

        fareByHour: calculateFareByHour(hourContext),
        hourly: hourly,
        hourContextTotal: hourContext.length,
        peak: findPeak(hourly)
    };
}
function hasActiveFilters() {
    return getActiveFilters().length > 0;
}
function buildPulseText(view) {
    if (view.summary.totalTrips === 0) {
        return {
            before: "No trips match these filters.",
            highlight: "",
            after: "",
            support: "Remove a filter or press Reset to see trips again."
        };
    }
    if (isHourFilterActive()) {
        let selectedTrips = 0;
        for (let hour = state.filters.hourFrom; hour <= state.filters.hourTo; hour++) {
            selectedTrips += view.hourly[hour];
        }
        const selectedShare = Math.round((selectedTrips / view.hourContextTotal) * 100);
        return {
            before: "The selected hours carry ",
            highlight: selectedShare + "%",
            after: " of trips.",
            support: describeHourFilter() + ": " + selectedTrips + " of " + view.hourContextTotal + " trips that match your other filters."
        };
    }
    const subject = hasActiveFilters() ? "Filtered trips are" : "The city is";
    const tripWord = hasActiveFilters() ? "filtered trips" : "trips";
    const windowShare = Math.round((view.peak.windowCount / view.hourContextTotal) * 100);
    return {
        before: subject + " busiest around ",
        highlight: formatHour(view.peak.peakHour),
        after: ".",
        support: windowShare + "% of " + tripWord + " occur between " + formatWindow(view.peak.windowStart) + "."
    };
}
function setPulseHeadline(text) {
    const headline = document.getElementById("pulse-headline");
    headline.textContent = text.before;
    if (text.highlight !== "") {
        const highlight = document.createElement("span");
        highlight.className = "pulse__highlight";
        highlight.textContent = text.highlight;
        headline.appendChild(highlight);
    }
    headline.appendChild(document.createTextNode(text.after));
}
function renderPulse(view) {
    const text = buildPulseText(view);
    setPulseHeadline(text);
    document.getElementById("pulse-support").textContent = text.support;
    document.getElementById("pulse-zone").textContent = buildZoneLine(view);
    document.getElementById("pulse-period").textContent = "Period \u00b7 " + describePeriod(state.meta);
    document.getElementById("data-badge").hidden = !state.meta.isMock;
    document.getElementById("stat-trips").textContent = formatCount(view.summary.totalTrips);
    document.getElementById("stat-fare").textContent = formatMoney(view.summary.avgFare);
    document.getElementById("stat-distance").textContent = formatMiles(view.summary.avgDistance);
    document.getElementById("stat-farepermile").textContent = view.summary.fareMile === null ? EMPTY_VALUE : "$" + view.summary.fareMile.toFixed(2) + "/mi";
}



function getHighlightRange(view) {
    if (isHourFilterActive()) {
        return { from: state.filters.hourFrom, to: state.filters.hourTo };
    }
    return { from: view.peak.windowStart, to: view.peak.windowStart + 1 };
}
function renderRhythmChart(view) {
    const range = getHighlightRange(view);
    renderRhythm(document.getElementById("rhythm-chart"), view.hourly, range.from, range.to, selectHour);
}
function selectHour(hour) {
    const alreadySelected = state.filters.hourFrom === hour && state.filters.hourTo === hour;
    state.filters.hourFrom = alreadySelected ? DEFAULT_FILTERS.hourFrom : hour;
    state.filters.hourTo = alreadySelected ? DEFAULT_FILTERS.hourTo : hour;
    syncControlsFromState();
    applyFilters();
}


function calculateFareByHour(trips) {
    const faresByHour = [];
    for (let hour = 0; hour < 24; hour++) {
        faresByHour.push([]);
    }
    for (const trip of trips) {
        if (trip.fare !== null) {
            faresByHour[getHour(trip)].push(trip.fare);
        }
    }
    return faresByHour.map(fares => average(fares));
}
function renderFareByHourChart(view) {
    const range = getHighlightRange(view);
    renderFareByHour(document.getElementById("fare-hour-chart"), view.fareByHour, range.from, range.to);
}



const TOP_ZONE_COUNT = 8;
function calculateTopZones(trips, limit) {
    const totals = {};
    for (const trip of trips) {
        const zoneId = trip.pickupZoneId;
        if (!totals[zoneId]) {
            totals[zoneId] = { zoneId: zoneId, trips: 0, fareSum: 0, fareCount: 0 };
        }
        totals[zoneId].trips += 1;
        if (trip.fare !== null) {
            totals[zoneId].fareSum += trip.fare;
            totals[zoneId].fareCount += 1;
        }
    }
    const zones = Object.values(totals).map(item => ({
        zoneId: item.zoneId,
        name: getZoneName(item.zoneId),
        borough: getZoneBorough(item.zoneId),
        trips: item.trips,
        share: trips.length > 0 ? (item.trips / trips.length) * 100 : 0,
        avgFare: item.fareCount > 0 ? item.fareSum / item.fareCount : null
    }));
    zones.sort((a, b) => b.trips - a.trips);
    return zones.slice(0, limit);
}
function renderZoneList(view) {
    renderZones(document.getElementById("zone-list"), view.zones, state.filters.zone, selectZone);
}
function selectZone(zoneId) {
    state.filters.zone = state.filters.zone === zoneId ? DEFAULT_FILTERS.zone : zoneId;
    syncControlsFromState();
    applyFilters();
}
function buildZoneLine(view) {
    if (view.zones.length === 0) {
        return "";
    }
    const leader = view.zones[0];
    const runnerUp = view.zones[1];
    const clearlyDominant = leader.share >= 20 || (runnerUp && leader.trips >= runnerUp.trips * 2);
    const verb = clearlyDominant ? " dominates pickups with " : " leads pickups with ";
    return leader.name + verb + leader.share.toFixed(1) + "% of trips.";
}


const MIN_QUALIFYING_DISTANCE = 0.5;
const MAX_SCATTER_POINTS = 2000;
const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];
function isQualifyingTrip(trip) {
    return trip.fare !== null && trip.distance !== null && trip.fare > 0 && trip.distance >= MIN_QUALIFYING_DISTANCE;
}
function hasFareAndDistance(trip) {
    return trip.fare !== null && trip.distance !== null && trip.fare > 0 && trip.distance > 0;
}
function fitFareModel(trips) {
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (const trip of trips) {
        if (!isQualifyingTrip(trip)) {
            continue;
        }
        count += 1;
        sumX += trip.distance;
        sumY += trip.fare;
        sumXY += trip.distance * trip.fare;
        sumXX += trip.distance * trip.distance;
    }
    const denominator = count * sumXX - sumX * sumX;
    if (count < 2 || denominator === 0) {
        return null;
    }
    const slope = (count * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / count;
    return { slope: slope, intercept: intercept };
}
function sampleItems(items, maxCount) {
    if (items.length <= maxCount) {
        return items;
    }
    const step = Math.ceil(items.length / maxCount);
    const sample = [];
    for (let i = 0; i < items.length; i += step) {
        sample.push(items[i]);
    }
    return sample;
}
function toScatterPoint(trip) {
    return {
        id: trip.id,
        distance: trip.distance,
        fare: trip.fare,
        borough: getZoneBorough(trip.pickupZoneId)
    };
}
function buildScatter(trips, model) {
    const qualifying = trips.filter(isQualifyingTrip);
    const sample = sampleItems(qualifying, MAX_SCATTER_POINTS);
    return { points: sample.map(toScatterPoint), total: qualifying.length, model: model };
}


function renderScatterChart(view) {
    renderScatter(document.getElementById("scatter-chart"), view.scatter.points, view.scatter.model, state.colorByBorough);
    renderScatterLegend();
    const shown = view.scatter.points.length;
    const total = view.scatter.total;
    const note = document.getElementById("scatter-note");
    if (shown < total) {
        note.textContent = "Showing a sample of " + shown + " of " + total + " trips to keep the chart responsive.";
    } else {
        note.textContent = total + " trips shown. Trips with a missing fare or a distance under " + MIN_QUALIFYING_DISTANCE + " mi are left out.";
    }
}
function renderScatterLegend() {
    const legend = document.getElementById("scatter-legend");
    legend.innerHTML = "";
    legend.hidden = !state.colorByBorough;
    if (!state.colorByBorough) {
        return;
    }
    for (const borough of BOROUGHS) {
        const item = document.createElement("li");
        item.className = "scatter-legend__item";
        const swatch = document.createElement("span");
        swatch.className = "scatter-legend__swatch " + boroughClass(borough);
        item.appendChild(swatch);
        item.appendChild(document.createTextNode(borough));
        legend.appendChild(item);
    }
}
function setupScatterControls() {
    document.getElementById("scatter-color").addEventListener("change", event => {
        state.colorByBorough = event.target.value === "borough";
        renderDashboard();
    });
}


function formatTripDate(pickupTime) {
    const month = Number(pickupTime.slice(5, 7));
    const day = Number(pickupTime.slice(8, 10));
    return MONTH_NAMES[month - 1].slice(0, 3) + " " + day;
}
function formatTripTime(pickupTime) {
    const hour = Number(pickupTime.slice(11, 13));
    const minutes = pickupTime.slice(14, 16);
    const suffix = hour < 12 ? "AM" : "PM";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return displayHour + ":" + minutes + " " + suffix;
}
function formatDuration(minutes) {
    return minutes === null ? EMPTY_VALUE : minutes + " min";
}
function getFarePerMile(trip) {
    if (trip.fare === null || trip.distance === null || trip.distance <= 0) {
        return null;
    }
    return trip.fare / trip.distance;
}
function getTripStatus(trip) {
    if (state.view && state.view.outlierIds.has(trip.id)) {
        return "Outlier";
    }
    return "Typical";
}
function createTripRow(trip) {
    const row = document.createElement("tr");
    row.dataset.tripId = trip.id;

    if (trip.id === state.selectedTripId) {
        row.classList.add("is-selected");
    }
    row.tabIndex = 0;
    const status = getTripStatus(trip);
    const cells = [
        { text: formatTripDate(trip.pickupTime) },
        { text: formatTripTime(trip.pickupTime) },
        { text: getZoneName(trip.pickupZoneId) },
        { text: getZoneName(trip.dropoffZoneId) },
        { text: formatDuration(trip.durationMin), className: "is-numeric" },
        { text: formatMiles(trip.distance), className: "is-numeric" },
        { text: formatMoney(trip.fare), className: "is-numeric" },
        { text: formatMoney(getFarePerMile(trip)), className: "is-numeric" },
        { text: status, className: status === "Outlier" ? "status--outlier" : "status--typical" }
    ];
    for (const cell of cells) {
        const td = document.createElement("td");
        td.textContent = cell.text;
        if (cell.className) {
            td.className = cell.className;
        }
        row.appendChild(td);
    }
    return row;
}
function renderTable(view) {
    const body = document.getElementById("trip-table-body");
    body.innerHTML = "";
    if (view.table.rows.length === 0) {
        body.appendChild(createEmptyRow());
    }


    for (const trip of view.table.rows) {
        body.appendChild(createTripRow(trip));
    }
    document.getElementById("evidence-summary").textContent = view.table.total.toLocaleString("en-US") + " results";
}


function getSortValue(trip, key) {
    if (key === "time") {
        return trip.pickupTime;
    }
    if (key === "pickupZone") {
        return getZoneName(trip.pickupZoneId);
    }
    if (key === "dropoffZone") {
        return getZoneName(trip.dropoffZoneId);
    }
    if (key === "duration") {
        return trip.durationMin;
    }
    if (key === "distance") {
        return trip.distance;
    }
    if (key === "fare") {
        return trip.fare;
    }
    if (key === "fareMile") {
        return getFarePerMile(trip);
    }
    return null;
}
function sortTrips(trips, key, direction) {
    const multiplier = direction === "asc" ? 1 : -1;
    return [...trips].sort((a, b) => {
        const valueA = getSortValue(a, key);
        const valueB = getSortValue(b, key);
        if (valueA === null && valueB === null) {
            return 0;
        }
        if (valueA === null) {
            return 1;
        }
        if (valueB === null) {
            return -1;
        }
        if (valueA < valueB) {
            return -1 * multiplier;
        }
        if (valueA > valueB) {
            return 1 * multiplier;
        }
        return 0;
    });
}
function buildTablePage() {
    const sorted = sortTrips(state.filteredTrips, state.table.sortBy, state.table.sortDir);
    const totalPages = Math.max(1, Math.ceil(sorted.length / state.table.pageSize));
    if (state.table.page > totalPages) {
        state.table.page = totalPages;
    }
    if (state.table.page < 1) {
        state.table.page = 1;
    }
    const start = (state.table.page - 1) * state.table.pageSize;
    return {
        rows: sorted.slice(start, start + state.table.pageSize),
        total: sorted.length,
        page: state.table.page,
        totalPages: totalPages
    };
}


function setupTableSorting() {
    const buttons = document.querySelectorAll(".sort-button");
    buttons.forEach(button => {
        button.addEventListener("click", () => handleSortClick(button.dataset.sort));
    });
}
function handleSortClick(key) {
    if (state.table.sortBy === key) {
        state.table.sortDir = state.table.sortDir === "asc" ? "desc" : "asc";
    } else {
        state.table.sortBy = key;
        state.table.sortDir = "asc";
    }
    state.table.page = 1;
    renderDashboard();
}
function updateSortIndicators() {
    const buttons = document.querySelectorAll(".sort-button");
    buttons.forEach(button => {
        const header = button.parentElement;
        if (button.dataset.sort === state.table.sortBy) {
            header.setAttribute("aria-sort", state.table.sortDir === "asc" ? "ascending" : "descending");
        } else {
            header.removeAttribute("aria-sort");
        }
    });
}



function setupPagination() {
    document.getElementById("page-prev").addEventListener("click", () => changePage(-1));
    document.getElementById("page-next").addEventListener("click", () => changePage(1));
}
function changePage(change) {
    state.table.page += change;
    renderDashboard();
}
function renderPagination(view) {
    const previous = document.getElementById("page-prev");
    const next = document.getElementById("page-next");
    const status = document.getElementById("pagination-status");
    previous.disabled = view.table.page <= 1;
    next.disabled = view.table.page >= view.table.totalPages;
    if (view.table.total === 0) {
        status.textContent = "No results";
    } else {
        status.textContent = "Page " + view.table.page + " of " + view.table.totalPages;
    }
}


function setupTableSelection() {
    const body = document.getElementById("trip-table-body");
    body.addEventListener("click", event => {
        const row = event.target.closest("tr");
        if (row && row.dataset.tripId) {
            selectTrip(Number(row.dataset.tripId));
        }
    });
    body.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        const row = event.target.closest("tr");
        if (row && row.dataset.tripId) {
            event.preventDefault();
            selectTrip(Number(row.dataset.tripId));
        }
    });
}
function selectTrip(tripId) {
    state.selectedTripId = tripId;
    updateSelectedRow();


    openDrawer(tripId);
}
function updateSelectedRow() {
    const rows = document.querySelectorAll("#trip-table-body tr");
    rows.forEach(row => {
        row.classList.toggle("is-selected", Number(row.dataset.tripId) === state.selectedTripId);
    });
}


let lastFocusedElement = null;
function findTripById(tripId) {
    return state.allTrips.find(trip => trip.id === tripId);
}
function buildTripNote(trip) {
    const model = state.view ? state.view.fareModel : null;
    if (!model || !hasFareAndDistance(trip)) {
        return "This trip has a missing fare or distance, so it is not compared with the expected fare.";
    }
    const expected = model.intercept + model.slope * trip.distance;
    if (expected <= 0) {
        return "The expected fare for this distance cannot be estimated from the current data.";
    }
    const ratio = trip.fare / expected;
    return "For " + formatMiles(trip.distance) + " the expected fare is about " + formatMoney(expected) + ". This trip's fare is " + ratio.toFixed(1) + "x that.";
}
function fillDrawer(trip) {
    document.getElementById("drawer-title").textContent = "Trip #" + trip.id;
    const details = [
        ["Date", formatTripDate(trip.pickupTime)],
        ["Pickup time", formatTripTime(trip.pickupTime)],
        ["Pickup zone", getZoneName(trip.pickupZoneId) + " (" + getZoneBorough(trip.pickupZoneId) + ")"],
        ["Dropoff zone", getZoneName(trip.dropoffZoneId)],
        ["Distance", formatMiles(trip.distance)],
        ["Duration", formatDuration(trip.durationMin)],
        ["Fare", formatMoney(trip.fare)],
        ["Fare per mile", formatMoney(getFarePerMile(trip))],
        ["Status", getTripStatus(trip)]

    ];
    const list = document.getElementById("drawer-list");
    list.innerHTML = "";
    for (const detail of details) {
        const row = document.createElement("div");
        row.className = "drawer__row";
        const term = document.createElement("dt");
        term.textContent = detail[0];
        const value = document.createElement("dd");
        value.textContent = detail[1];
        row.appendChild(term);
        row.appendChild(value);
        list.appendChild(row);
    }
    document.getElementById("drawer-note").textContent = buildTripNote(trip);
}
function openDrawer(tripId) {
    const trip = findTripById(tripId);
    if (!trip) {
        return;
    }
    lastFocusedElement = document.activeElement;
    fillDrawer(trip);
    const drawer = document.getElementById("trip-drawer");
    document.getElementById("drawer-backdrop").hidden = false;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.getElementById("drawer-close").focus();
}
function closeDrawer() {
    const drawer = document.getElementById("trip-drawer");
    if (!drawer.classList.contains("is-open")) {
        return;
    }
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.getElementById("drawer-backdrop").hidden = true;
    state.selectedTripId = null;
    updateSelectedRow();
    if (lastFocusedElement) {
        lastFocusedElement.focus();
    }

}
function setupDrawer() {
    document.getElementById("drawer-close").addEventListener("click", closeDrawer);
    document.getElementById("drawer-backdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeDrawer();
        }
    });
}


function delay(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}
function setStatus(name, message) {
    state.status = name;
    document.body.dataset.status = name;
    const banner = document.getElementById("state-banner");
    const text = document.getElementById("state-banner-text");
    const retry = document.getElementById("state-banner-retry");
    banner.hidden = name === "ready" || name === "empty";
    retry.hidden = true;
    text.textContent = message || "";

    if (name === "error") {
        retry.hidden = false;
        renderTableError();
    }
    if (name === "loading") {
        text.textContent = "Loading trip data\u2026";
        renderTableLoading();
    }
}
function renderTableLoading() {
    const body = document.getElementById("trip-table-body");
    body.innerHTML = "";
    for (let rowNumber = 0; rowNumber < 6; rowNumber++) {
        const row = document.createElement("tr");
        row.className = "skeleton-row";
        for (let columnNumber = 0; columnNumber < 9; columnNumber++) {
            const cell = document.createElement("td");
            const bar = document.createElement("span");
            bar.className = "skeleton-bar";
            cell.appendChild(bar);
            row.appendChild(cell);

        }
        body.appendChild(row);
    }
}


function createMessageRow(message, extraClass) {
    const row = document.createElement("tr");
    row.className = "skeleton-row";
    const cell = document.createElement("td");
    cell.colSpan = 9;
    cell.className = "table-message " + extraClass;
    cell.textContent = message;
    row.appendChild(cell);
    return row;
}
function createEmptyRow() {
    const row = createMessageRow("No trips match these filters.", "");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "table-message__reset";
    button.textContent = "Reset filters";
    button.addEventListener("click", resetFilters);
    row.firstChild.appendChild(button);
    return row;
}


function renderTableError() {
    const body = document.getElementById("trip-table-body");
    body.innerHTML = "";
    body.appendChild(createMessageRow("The trip table could not be loaded.", "table-message--error"));
    document.getElementById("evidence-summary").textContent = "";
    document.getElementById("pagination-status").textContent = ""
}
document.getElementById("state-banner-retry").addEventListener("click", () => window.location.reload());


const OUTLIER_COUNT = 10;
const DOT = " \u00b7 ";
function scoreUnusualTrip(trip, model) {
    if (!model || !hasFareAndDistance(trip)) {
        return null;
    }
    return trip.fare - (model.intercept + model.slope * trip.distance);
}
function scoreExpensiveTrip(trip) {
    if (!hasFareAndDistance(trip)) {
        return null;
    }
    return trip.fare;
}
function calculateOutliers(trips, model, lens) {
    const scoreTrip = lens === "expensive" ? scoreExpensiveTrip : trip => scoreUnusualTrip(trip, model);
    const startTime = performance.now();
    const result = topK(trips, OUTLIER_COUNT, scoreTrip);
    result.elapsedMs = performance.now() - startTime;
    return result;
}
function buildOutlierReason(entry, model) {
    const trip = entry.item;
    if (state.outlierLens === "expensive") {
        return { title: "Highest fares", detail: formatMoney(trip.fare) + " for " + formatMiles(trip.distance) };
    }
    const expected = model.intercept + model.slope * trip.distance;
    if (expected > 0) {
        return {
            title: "Unusually high fare",
            detail: formatMoney(entry.score) + " above the expected " + formatMoney(expected) + " for " + formatMiles(trip.distance)
        };
    }
    return { title: "Unusually high fare", detail: formatMoney(entry.score) + " above the expected fare" };
}


function createOutlierRow(entry, index, model) {
    const trip = entry.item;
    const reason = buildOutlierReason(entry, model);
    const item = document.createElement("li");
    item.className = "outlier-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "outlier-row__button";
    button.addEventListener("click", () => selectTrip(trip.id));
    const reasonBox = document.createElement("span");
    reasonBox.className = "outlier-row__reason";
    reasonBox.appendChild(createTextSpan("outlier-row__reason-title", reason.title));
    reasonBox.appendChild(createTextSpan("outlier-row__reason-detail", reason.detail));
    button.appendChild(createTextSpan("outlier-row__rank", "#" + (index + 1)));
    button.appendChild(createTextSpan("outlier-row__fare", "$" + Math.round(trip.fare)));
    button.appendChild(createTextSpan("outlier-row__route", getZoneName(trip.pickupZoneId) + " \u2192 " + getZoneName(trip.dropoffZoneId)));
    button.appendChild(createTextSpan("outlier-row__meta", formatMiles(trip.distance) + DOT + formatDuration(trip.durationMin)));
    button.appendChild(reasonBox);
    button.appendChild(createTextSpan("outlier-row__inspect", "Inspect \u2192"));
    item.appendChild(button);
    return item;
}
function renderOutliers(view) {
    const lens = state.outlierLens;
    const list = document.getElementById("outlier-list");
    const meta = document.getElementById("outlier-meta");
    document.getElementById("outlier-intro").textContent = lens === "unusual"
        ? "Ranked by how far the fare is above the expected fare for the distance, not simply by price."
        : "Ranked by the highest fare, whatever the distance.";
    document.getElementById("lens-unusual").classList.toggle("is-active", lens === "unusual");
    document.getElementById("lens-unusual").setAttribute("aria-pressed", lens === "unusual" ? "true" : "false");
    document.getElementById("lens-expensive").classList.toggle("is-active", lens === "expensive");
    document.getElementById("lens-expensive").setAttribute("aria-pressed", lens === "expensive" ? "true" : "false");
    list.innerHTML = "";
    const result = view.outliers;
    if (result.entries.length === 0) {
        const message = document.createElement("li");
        message.className = "chart-empty";
        message.textContent = "No qualifying trips to rank for these filters.";
        list.appendChild(message);
        meta.textContent = "";
        return;
    }
    meta.textContent = "Ranked from " + result.qualifying + " qualifying trips" + DOT + result.excluded + " excluded" + DOT + "computed in " + result.elapsedMs.toFixed(1) + " ms";
    result.entries.forEach((entry, index) => {
        list.appendChild(createOutlierRow(entry, index, view.fareModel));
    });
}
function setupOutlierControls() {
    document.getElementById("lens-unusual").addEventListener("click", () => setOutlierLens("unusual"));
    document.getElementById("lens-expensive").addEventListener("click", () => setOutlierLens("expensive"));
}
function setOutlierLens(lens) {
    state.outlierLens = lens;
    renderDashboard();
}


async function loadStartupData() {
    if (config.useMockData) {
        return loadMockData();
    }
    throw new Error("The backend start-up data is added in Stage 49.");
}
async function getView() {
    if (config.useMockData) {
        return buildView();
    }
    throw new Error("The backend view is added in Stage 49.");
}


