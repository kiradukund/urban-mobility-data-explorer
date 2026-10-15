// Chart logic [I iwll go ahead and calculate the average fare of each hour and use it to draw it as an svg line chart with axes, and gaps for missing hours.]
function renderRhythm(container, hourlyCounts, highlightFrom, highlightTo, onSelect) {
    container.innerHTML = "";
    const maxCount = Math.max(...hourlyCounts);


    if (maxCount === 0) {
        renderEmptyChart(container, "No trips match these filters.");
        return;
    }
    for (let hour = 0; hour < 24; hour++) {
        const count = hourlyCounts[hour];
        const heightPercent = maxCount === 0 ? 0 : (count / maxCount) * 100;
        const bar = document.createElement("button");
        bar.type = "button";
        bar.className = "rhythm__bar";
        bar.style.height = heightPercent + "%";
        bar.title = formatHour(hour) + ": " + count + (count === 1 ? " trip" : " trips");
        bar.setAttribute("aria-label", bar.title + ". Select to filter to this hour.");
        if (hour >= highlightFrom && hour <= highlightTo) {
            bar.classList.add("rhythm__bar--highlight");
        }
        bar.addEventListener("click", () => onSelect(hour));
        container.appendChild(bar);
    }
}


const SVG_NS = "http://www.w3.org/2000/svg";
function svgElement(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const name in attributes) {
        element.setAttribute(name, attributes[name]);
    }
    return element;
}
function niceMax(value, step) {
    return Math.max(step, Math.ceil(value / step) * step);
}
function renderFareByHour(container, fareByHour, highlightFrom, highlightTo) {
    container.innerHTML = "";
    const width = 560;
    const height = 280;
    const margin = { top: 16, right: 16, bottom: 34, left: 48 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    let maxFare = 0;
    if (fareByHour.every(fare => fare === null)) {
        renderEmptyChart(container, "No fares to show for these filters.");
        return;
    }


    for (const fare of fareByHour) {
        if (fare !== null && fare > maxFare) {
            maxFare = fare;
        }
    }
    const yMax = niceMax(maxFare, 40);
    const scaleX = hour => margin.left + (hour / 23) * plotWidth;
    const scaleY = value => margin.top + plotHeight - (value / yMax) * plotHeight;
    const svg = svgElement("svg", {
        viewBox: "0 0 " + width + " " + height,
        class: "line-chart__svg",
        role: "img",
        "aria-label": "Average fare by pickup hour"
    });
    for (let i = 0; i <= 4; i++) {
        const value = (yMax / 4) * i;
        const y = scaleY(value);
        svg.appendChild(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "line-chart__grid" }));
        const label = svgElement("text", { x: margin.left - 8, y: y + 4, "text-anchor": "end", class: "line-chart__axis-text" });
        label.textContent = "$" + value;
        svg.appendChild(label);
    }
    [0, 6, 12, 18, 23].forEach(hour => {
        const label = svgElement("text", { x: scaleX(hour), y: height - 10, "text-anchor": "middle", class: "line-chart__axis-text" });
        label.textContent = formatHour(hour);
        svg.appendChild(label);
    });
    let pathData = "";
    let previousWasMissing = true;
    for (let hour = 0; hour < 24; hour++) {
        const fare = fareByHour[hour];
        if (fare === null) {
            previousWasMissing = true;
            continue;
        }
        pathData += (previousWasMissing ? "M" : "L") + scaleX(hour).toFixed(1) + " " + scaleY(fare).toFixed(1) + " ";
        previousWasMissing = false;
    }
    svg.appendChild(svgElement("path", { d: pathData, class: "line-chart__path" }));
    for (let hour = 0; hour < 24; hour++) {
        const fare = fareByHour[hour];
        if (fare === null) {
            continue;
        }
        const inRange = hour >= highlightFrom && hour <= highlightTo;
        const point = svgElement("circle", {
            cx: scaleX(hour),
            cy: scaleY(fare),
            r: inRange ? 5 : 3.5,
            class: inRange ? "line-chart__point line-chart__point--highlight" : "line-chart__point"
        });
        const title = svgElement("title", {});
        title.textContent = formatHour(hour) + ": " + formatMoney(fare) + " average fare";
        point.appendChild(title);
        svg.appendChild(point);
    }
    container.appendChild(svg);
}


function createTextSpan(className, text) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
}
function renderZones(container, zones, selectedZoneId, onSelect) {
    container.innerHTML = "";
    if (zones.length === 0) {
        renderEmptyChart(container, "No pickups match these filters.");
        return;
    }
    const head = document.createElement("div");
    head.className = "zone-list__head";
    head.appendChild(document.createElement("span"));
    head.appendChild(createTextSpan("", "Zone"));
    head.appendChild(createTextSpan("", "Share"));
    head.appendChild(createTextSpan("", "Trips"));
    head.appendChild(createTextSpan("", "Avg fare"));
    container.appendChild(head);
    const maxTrips = zones[0].trips;
    zones.forEach((zone, index) => {
        const isSelected = zone.zoneId === selectedZoneId;
        const row = document.createElement("button");
        row.type = "button";
        row.className = isSelected ? "zone-row zone-row--selected" : "zone-row";
        row.setAttribute("aria-pressed", isSelected ? "true" : "false");
        const main = document.createElement("span");
        const bar = document.createElement("span");
        bar.className = "zone-row__bar";
        bar.style.width = (zone.trips / maxTrips) * 100 + "%";
        main.appendChild(createTextSpan("zone-row__name", zone.name));
        main.appendChild(createTextSpan("zone-row__borough", zone.borough));
        main.appendChild(bar);
        row.appendChild(createTextSpan("zone-row__rank", String(index + 1).padStart(2, "0")));
        row.appendChild(main);
        row.appendChild(createTextSpan("zone-row__share", zone.share.toFixed(1) + "%"));
        row.appendChild(createTextSpan("zone-row__trips", formatCount(zone.trips)))
        row.appendChild(createTextSpan("zone-row__fare", formatMoney(zone.avgFare)));
        row.addEventListener("click", () => onSelect(zone.zoneId));
        container.appendChild(row);
    });
}


function boroughClass(borough) {
    return "scatter__point--" + borough.toLowerCase().replace(" ", "-");
}
function renderScatter(container, points, model, colorByBorough) {
    container.innerHTML = "";
    const width = 760;
    const height = 380;
    const margin = { top: 20, right: 20, bottom: 50, left: 56 };
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    if (points.length === 0) {
        renderEmptyChart(container, "No qualifying trips match these filters.");
        return;
    }


    let maxDistance = 0;
    let maxFare = 0;
    for (const point of points) {
        if (point.distance > maxDistance) {
            maxDistance = point.distance;
        }
        if (point.fare > maxFare) {
            maxFare = point.fare;
        }
    }
    const xMax = niceMax(maxDistance, 4);
    const yMax = niceMax(maxFare, 40);
    const scaleX = value => margin.left + (value / xMax) * plotWidth;
    const scaleY = value => margin.top + plotHeight - (value / yMax) * plotHeight;
    const svg = svgElement("svg", {
        viewBox: "0 0 " + width + " " + height,
        class: "scatter__svg",
        role: "img",
        "aria-label": "Scatter plot of fare against distance for a sample of trips"
    });
    for (let i = 0; i <= 4; i++) {
        const fareValue = (yMax / 4) * i;
        const y = scaleY(fareValue);
        svg.appendChild(svgElement("line", { x1: margin.left, x2: width - margin.right, y1: y, y2: y, class: "scatter__grid" }));
        const yLabel = svgElement("text", { x: margin.left - 8, y: y + 4, "text-anchor": "end", class: "scatter__axis-text" });
        yLabel.textContent = "$" + fareValue;
        svg.appendChild(yLabel);
        const distanceValue = (xMax / 4) * i;
        const xLabel = svgElement("text", { x: scaleX(distanceValue), y: height - 28, "text-anchor": "middle", class: "scatter__axis-text" });
        xLabel.textContent = distanceValue;
        svg.appendChild(xLabel);
    }
    const xTitle = svgElement("text", { x: margin.left + plotWidth / 2, y: height - 6, "text-anchor": "middle", class: "scatter__axis-title" });
    xTitle.textContent = "Distance (miles)";
    svg.appendChild(xTitle);
    const yTitle = svgElement("text", { x: 8, y: 12, "text-anchor": "start", class: "scatter__axis-title" });
    yTitle.textContent = "Fare ($)";
    svg.appendChild(yTitle);
    if (model) {
        const clip = svgElement("clipPath", { id: "scatter-clip" });
        clip.appendChild(svgElement("rect", { x: margin.left, y: margin.top, width: plotWidth, height: plotHeight }));
        svg.appendChild(clip);
        svg.appendChild(svgElement("line", {
            x1: scaleX(0),
            y1: scaleY(model.intercept),
            x2: scaleX(xMax),
            y2: scaleY(model.intercept + model.slope * xMax),
            class: "scatter__trend",
            "clip-path": "url(#scatter-clip)"

        }));
    }
    for (const point of points) {
        const circle = svgElement("circle", {
            cx: scaleX(point.distance),
            cy: scaleY(point.fare),
            r: 3.5,
            class: colorByBorough ? "scatter__point " + boroughClass(point.borough) : "scatter__point"
        });
        const title = svgElement("title", {});
        title.textContent = formatMoney(point.fare) + " for " + formatMiles(point.distance) + ", " + point.borough;
        circle.appendChild(title);
        svg.appendChild(circle);
    }
    container.appendChild(svg);
}


function renderEmptyChart(container, message) {
    container.innerHTML = "";
    const note = document.createElement("p");
    note.className = "chart-empty";
    note.textContent = message;
    container.appendChild(note);
}


