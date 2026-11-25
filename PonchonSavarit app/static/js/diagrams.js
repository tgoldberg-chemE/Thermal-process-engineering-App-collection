
let originalAxisRanges = {};
let currentDiagramType = null;

// ==================================================
// PLOTLY CONFIGURATION
// ==================================================

const plotConfig = {
    responsive: true,
    displaylogo: false,
    scrollZoom: true,
    doubleClick: "autosize",
        toImageButtonOptions: {
        format: "png",
        filename: "Rectification_Diagram",
        scale: 4
    },
    modeBarButtonsToRemove: [
        "lasso2d",
        "select2d",
        "resetScale2d"
    ]
};


// ==================================================
// COMMON PLOT LAYOUT
// ==================================================

function plotLayout(xTitle, yTitle, extra = {}) {

    const mixture =
        $("mixture")?.selectedOptions[0]?.textContent || "";

    const pressure = $("pressure")?.value || "";

    const commonAxisStyle = {
        showline: true,
        mirror: true,
        linewidth: 1.6,
        linecolor: "#000000",
        gridcolor: "#e7ebef",
        zeroline: false,
        tickfont: {
            size: 14
        }
    };

    const commonTitleStyle = {
        font: {
            size: 16
        }
    };

    const layout = {
        autosize: true,

        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",

        margin: {
            l: 75,
            r: 30,
            t: 50,
            b: 75
        },

        font: {
            family: "Arial, sans-serif",
            size: 14,
            color: "#344054"
        },

        xaxis: {
            ...commonAxisStyle,
            title: {
                text: xTitle,
                ...commonTitleStyle
            },
            range: [0, 1]
        },

        yaxis: {
            ...commonAxisStyle,
            title: {
                text: yTitle,
                ...commonTitleStyle
            }
        },

        title: {
            text: mixture && pressure
                ? `${mixture}, ${Number(pressure).toFixed(3)} bar`
                : mixture,
            x: 0.5,
            xanchor: "center",
            y: 0.97,
            yanchor: "top",
            font: {
                size: 18,
                color: "#344054"
            }
        },

        hovermode: "closest",
        showlegend: false,

        legend: {
            orientation: "h",
            y: -0.22
        },

        ...extra
    };

    ["xaxis", "yaxis"].forEach(axisName => {

        layout[axisName] = {
            ...layout[axisName],
            ...commonAxisStyle,

            title: {
                ...layout[axisName].title,
                font: commonTitleStyle.font
            }
        };

    });

    return layout;
}


// ==================================================
// ARRAY HELPERS
// ==================================================

function numericArray(values) {

    return Array.isArray(values)
        ? values.map(Number)
        : [];
}


function validArrays(...arrays) {

    return (
        arrays.length > 0 &&
        arrays.every(Array.isArray) &&
        arrays.every(array => array.length > 0) &&
        arrays.every(array => array.length === arrays[0].length) &&
        arrays.flat().every(value =>
            Number.isFinite(Number(value))
        )
    );
}


// ==================================================
// WATERMARK
// ==================================================

function addWatermark(layout) {

    return {
        ...layout,

        images: [
            ...(layout.images || []),

            {
                source: `${APP_ROOT}/static/watermark.png`,
                xref: "x domain",
                yref: "y domain",
                x: 0.5,
                y: 0.5,
                sizex: 0.85,
                sizey: 0.65,
                xanchor: "center",
                yanchor: "middle",
                sizing: "contain",
                opacity: 0.12,
                layer: "below"
            }
        ]
    };
}


// ==================================================
// PLOTLY RENDERING
// ==================================================



function renderPlot(traces, layout, message) {

    if (!chart) return Promise.resolve();

    if (typeof Plotly === "undefined") {
        showDiagramMessage(
            "Plotly.js is not loaded. Check index.html."
        );
        return Promise.resolve();
    }

    return Plotly.react(
        chart,
        traces,
        addWatermark(layout),
        plotConfig
    )
    .then(() => {

        // Save the initial axis ranges and apply native zoom limits
        chart._initialAxisRanges = {};

        const axisLimits = {};
        const tickUpdate = {};

        const axes = [
            "xaxis",
            "yaxis",
            "xaxis2",
            "yaxis2"
        ];

        axes.forEach(axisName => {

            const axis = chart._fullLayout?.[axisName];

            if (
                !axis ||
                !Array.isArray(axis.range) ||
                axis.range.length !== 2
            ) {
                return;
            }

            const range = axis.range.map(Number);

            if (!range.every(Number.isFinite)) return;

            // Store original axis range
            chart._initialAxisRanges[axisName] = [...range];

            // Set native zoom boundaries
            const minBound = Math.min(...range);
            const maxBound = Math.max(...range);

            axisLimits[`${axisName}.minallowed`] = minBound;
            axisLimits[`${axisName}.maxallowed`] = maxBound;

            // Apply consistent decimal formatting
            if (
                typeof currentDiagramType !== "undefined" &&
                currentDiagramType === "nxt" &&
                axisName === "yaxis"
            ) {
                tickUpdate["yaxis.tickmode"] = "linear";
                tickUpdate["yaxis.tick0"] = 0;
                tickUpdate["yaxis.dtick"] = 1;
                tickUpdate["yaxis.tickformat"] = "d";

            } else {
                tickUpdate[`${axisName}.tickformat`] =
                    getDynamicTickFormat(range);
            }
        });

        // Apply zoom limits and tick formatting
        const combinedUpdate = {
            ...axisLimits,
            ...tickUpdate
        };

        return Plotly.relayout(chart, combinedUpdate).then(() => {

            showDiagramMessage(
                traces.length === 0 ? (message || "") : ""
            );

            attachPlotClickHandler();
            enableDynamicAxisFormatting(chart);

        });

    })
    .catch(error => {

        console.error("Plotly rendering error:", error);

        showDiagramMessage(
            "The diagram could not be rendered."
        );

        throw error;
    });
}



async function updateInitialAxisRanges(graph) {

    if (!graph || !graph._fullLayout) return;

    const axes = [
        "xaxis",
        "yaxis",
        "xaxis2",
        "yaxis2"
    ];

    const axisLimits = {};

    const newRanges = {};

    axes.forEach(axisName => {

        const axis = graph._fullLayout[axisName];

        if (
            !axis ||
            !Array.isArray(axis.range) ||
            axis.range.length !== 2
        ) {
            return;
        }

        const range = axis.range.map(Number);

        if (!range.every(Number.isFinite)) return;

        newRanges[axisName] = [...range];

        axisLimits[`${axisName}.minallowed`] =
            Math.min(...range);

        axisLimits[`${axisName}.maxallowed`] =
            Math.max(...range);

    });

    graph._initialAxisRanges = newRanges;

    if (Object.keys(axisLimits).length > 0) {

        await Plotly.relayout(graph, axisLimits);

    }
}



// ==================================================
// PLOTLY DATA POINT SELECTION
// ==================================================

function attachPlotClickHandler() {

    if (!chart) return;

    if (chart.dataset.clickHandlerAttached === "true") {
        return;
    }

    if (typeof chart.on !== "function") {
        return;
    }

    chart.on("plotly_click", event => {

        const point = event?.points?.[0];

        if (!point) return;

        const x = Number(point.x);
        const y = Number(point.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        const annotation = {
            x: x,
            y: y,
            xref: "x",
            yref: "y",

            text:
                `x = ${x.toFixed(4)}<br>` +
                `y = ${y.toFixed(4)}`,

            showarrow: false,

            xanchor: "left",
            yanchor: "middle",

            xshift: 12,
            yshift: 0,

            bgcolor: "#ffffff",
            bordercolor: "#f91693",
            borderwidth: 1,
            borderpad: 6,

            font: {
                color: "#344054",
                size: 12
            }
        };

        const markerTrace = {
            x: [x],
            y: [y],

            type: "scatter",
            mode: "markers",

            marker: {
                size: 13,
                color: "#f91693",
                line: {
                    color: "#ffffff",
                    width: 2
                }
            },

            showlegend: false,

            hovertemplate:
                `x = ${x.toFixed(4)}<br>` +
                `y = ${y.toFixed(4)}` +
                "<extra>Selected point</extra>"
        };

        const annotations = [
            ...(chart.layout.annotations || []),
            annotation
        ];

        Plotly.addTraces(chart, markerTrace).then(() => {

            Plotly.relayout(chart, {
                annotations: annotations
            });

        });

    });

    chart.dataset.clickHandlerAttached = "true";
}


// ==================================================
// CLEAR DIAGRAM
// ==================================================

function clearDiagram() {

    if (!chart) return;

    if (typeof Plotly !== "undefined") {
        Plotly.purge(chart);
    }

    delete chart.dataset.clickHandlerAttached;
    delete chart.dataset.dynamicAxisHandlerAttached;

    showDiagramMessage("");
}


// ==================================================
// DYNAMIC AXIS FORMATTING
// ==================================================

function getDynamicTickFormat(range) {

    if (!range || range.length !== 2) {
        return ".2f";
    }

    const span = Math.abs(
        Number(range[1]) - Number(range[0])
    );

    if (span >= 0.5) return ".1f";
    if (span >= 0.1) return ".2f";
    if (span >= 0.01) return ".3f";
    if (span >= 0.001) return ".4f";

    return ".5f";
}





function enableDynamicAxisFormatting(plot) {

    if (!plot) return;

    if (plot.dataset.dynamicAxisHandlerAttached === "true") {
        return;
    }

    if (typeof plot.on !== "function") {
        return;
    }

    const axes = [
        "xaxis",
        "yaxis",
        "xaxis2",
        "yaxis2"
    ];

    plot.on("plotly_relayout", function(eventData) {

        // Prevent recursive relayout calls
        if (plot.dataset.zoomLimitUpdating === "true") {
            return;
        }

        // --------------------------------------------------
        // DETECT AUTOSCALE
        // --------------------------------------------------

        const autoscaleTriggered = Object.keys(eventData).some(key =>
            key.endsWith(".autorange") &&
            eventData[key] === true
        );

        // After autoscaling, update the zoom boundaries
        // to the newly calculated axis ranges.
        if (autoscaleTriggered) {

            requestAnimationFrame(() => {

                updateInitialAxisRanges(plot);

            });

            return;
        }

        // --------------------------------------------------
        // DYNAMIC TICK FORMATTING AND ZOOM LIMITS
        // --------------------------------------------------

        const update = {};

        axes.forEach(axisName => {

            const first = eventData[`${axisName}.range[0]`];
            const second = eventData[`${axisName}.range[1]`];
            const range = eventData[`${axisName}.range`];

            let currentRange = null;

            if (
                first !== undefined &&
                second !== undefined
            ) {

                currentRange = [first, second];

            } else if (Array.isArray(range)) {

                currentRange = range;

            }

            if (!currentRange) return;

            // Dynamic tick formatting
            if (
                typeof currentDiagramType !== "undefined" &&
                currentDiagramType === "nxt" &&
                axisName === "yaxis"
            ) {

                update["yaxis.tickmode"] = "linear";
                update["yaxis.tick0"] = 0;
                update["yaxis.dtick"] = 1;
                update["yaxis.tickformat"] = "d";

            } else {

                update[`${axisName}.tickformat`] =
                    getDynamicTickFormat(currentRange);

            }

            // Get current zoom boundaries
            const initialRange =
                plot._initialAxisRanges?.[axisName];

            if (!initialRange || initialRange.length !== 2) {
                return;
            }

            const valuesAreNumeric = [
                ...initialRange,
                ...currentRange
            ].every(value =>
                Number.isFinite(Number(value))
            );

            if (!valuesAreNumeric) return;

            const originalFirst = Number(initialRange[0]);
            const originalSecond = Number(initialRange[1]);

            const currentFirst = Number(currentRange[0]);
            const currentSecond = Number(currentRange[1]);

            const minBound = Math.min(
                originalFirst,
                originalSecond
            );

            const maxBound = Math.max(
                originalFirst,
                originalSecond
            );

            // Restrict zoom and panning to initial boundaries
            let newFirst = Math.max(
                minBound,
                Math.min(maxBound, currentFirst)
            );

            let newSecond = Math.max(
                minBound,
                Math.min(maxBound, currentSecond)
            );

            // Preserve reversed axis direction
            const isReversed =
                originalFirst > originalSecond;

            if (isReversed) {

                [newFirst, newSecond] = [
                    newSecond,
                    newFirst
                ];

            }

            // Prevent collapsed ranges
            if (Math.abs(newSecond - newFirst) < 1e-12) {

                newFirst = originalFirst;
                newSecond = originalSecond;

            }

            const tolerance = 1e-10;

            if (
                Math.abs(newFirst - currentFirst) > tolerance ||
                Math.abs(newSecond - currentSecond) > tolerance
            ) {

                update[`${axisName}.range`] = [
                    newFirst,
                    newSecond
                ];

                update[`${axisName}.autorange`] = false;

            }

        });

        // --------------------------------------------------
        // APPLY REQUIRED UPDATES
        // --------------------------------------------------

        if (Object.keys(update).length > 0) {

            plot.dataset.zoomLimitUpdating = "true";

            Plotly.relayout(plot, update)
                .finally(() => {

                    plot.dataset.zoomLimitUpdating = "false";

                });

        }

    });

    plot.dataset.dynamicAxisHandlerAttached = "true";
}





// ==================================================
// H-XY SCALING
// ==================================================



async function setHxyScale(mode) {

    hxyScaleMode = mode;
    updateHxyScaleSwitch();

    if (
        !diagramInfo[selectedDiagram] ||
        diagramInfo[selectedDiagram].key !== "hxy"
    ) {
        return;
    }

    const graph = document.getElementById("demoChart");

    if (!graph || !graph.data || !graph._fullLayout) {
        console.error("HXY Plotly-Diagramm nicht verfügbar.");
        return;
    }

    if (mode === "vle") {

        if (
            !isValidAxisRange(hxyVleXRange) ||
            !isValidAxisRange(hxyVleYRange)
        ) {
            console.warn("Keine gültige VLE-Referenz vorhanden.");
            return;
        }

        await Plotly.relayout(graph, {
            "xaxis.autorange": false,
            "yaxis.autorange": false,
            "xaxis.range": [...hxyVleXRange],
            "yaxis.range": [...hxyVleYRange]
        });

    } else if (mode === "auto") {

        await Plotly.relayout(graph, {
            "xaxis.autorange": false,
            "yaxis.autorange": true,
            "xaxis.range": [0, 1],
        });
    }

    console.log("HXY scale mode:", mode);
    console.log("Displayed X:", graph._fullLayout.xaxis.range);
    console.log("Displayed Y:", graph._fullLayout.yaxis.range);
}



$("hxyVleScale")?.addEventListener(
    "click",
    () => setHxyScale("vle")
);

$("hxyAutoScale")?.addEventListener(
    "click",
    () => setHxyScale("auto")
);


// ==================================================
// SAVE H-XY VLE SCALE
// ==================================================


function saveHxyVleScale(data) {

    if (!data) return;

    const xValues = [
        ...numericArray(data.x),
        ...numericArray(data.y)
    ].filter(Number.isFinite);

    const yValues = [
        ...numericArray(data.h_liquid),
        ...numericArray(data.h_vapor)
    ].filter(Number.isFinite);

    if (xValues.length === 0 || yValues.length === 0) {
        console.warn("Cannot save H-XY VLE scale: no valid data.");
        return;
    }

    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);

    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    const paddingX = Math.max(
        0.01,
        (maxX - minX) * 0.05
    );

    const paddingY = Math.max(
        1,
        (maxY - minY) * 0.05
    );

    hxyVleXRange = [
        Math.max(0, minX - paddingX),
        Math.min(1, maxX + paddingX)
    ];

    hxyVleYRange = [
        minY - paddingY,
        maxY + paddingY
    ];
}

// ==================================================
// UPDATE H-XY SCALE SWITCH
// ==================================================


function updateHxyScaleSwitch() {

    const switchElement = $("hxyScaleSwitch");
    const vleButton = $("hxyVleScale");
    const autoButton = $("hxyAutoScale");

    if (!switchElement || !vleButton || !autoButton) return;

    const isHxy =
        diagramInfo[selectedDiagram]?.key === "hxy";

    switchElement.hidden = !isHxy;

    vleButton.classList.toggle(
        "active",
        hxyScaleMode === "vle"
    );

    autoButton.classList.toggle(
        "active",
        hxyScaleMode === "auto"
    );
}



// ==================================================
// H-XY DIAGRAM
// ==================================================


function drawEnthalpyDiagram(data) {

    const xTitle = "Mole fraction x, y";
    const yTitle = "Molar enthalpy h / kJ mol⁻¹";

    if (!data) {
        renderPlot(
            [],
            plotLayout(xTitle, yTitle),
            "Please calculate VLE and enthalpy first."
        );
        return;
    }

    const traces = [];
    const annotations = [];

    // Read global stage data without shadowing the global variable.
    const currentStageData =
        typeof stageData !== "undefined" ? stageData : null;

    // ==================================================
    // TEMPERATURE HANDLING
    // ==================================================

    function getTemperatureK(obj) {
        if (!obj) return null;

        if (obj.temperature_K !== undefined) {
            const v = Number(obj.temperature_K);
            return Number.isFinite(v) ? v : null;
        }

        if (obj.temperature_k !== undefined) {
            const v = Number(obj.temperature_k);
            return Number.isFinite(v) ? v : null;
        }

        if (obj.temperature_C !== undefined) {
            const v = Number(obj.temperature_C);
            return Number.isFinite(v) ? v + 273.15 : null;
        }

        if (obj.temperature !== undefined) {
            const v = Number(obj.temperature);
            return Number.isFinite(v) ? v + 273.15 : null;
        }

        if (obj.T !== undefined) {
            const v = Number(obj.T);
            return Number.isFinite(v) ? v + 273.15 : null;
        }

        return null;
    }

    function addTemperatureLabel(
        x,
        h,
        temperatureK,
        angleDeg = 0,
        color = "#333333"
    ) {
        if (
            ![
                Number(x),
                Number(h),
                Number(temperatureK),
                Number(angleDeg)
            ].every(Number.isFinite)
        ) return;

        annotations.push({
            x: Number(x),
            y: Number(h),
            text: `${Number(temperatureK).toFixed(2)} K`,
            showarrow: false,
            textangle: Number(angleDeg),
            font: {
                size: 11,
                color: color
            },
            bgcolor: "rgba(255,255,255,0.75)",
            borderpad: 2
        });
    }

    // ==================================================
    // HELPER FUNCTIONS
    // ==================================================

    function interpolate(xValues, hValues, xTarget) {

        if (
            !Array.isArray(xValues) ||
            !Array.isArray(hValues) ||
            xValues.length !== hValues.length ||
            !Number.isFinite(Number(xTarget))
        ) return null;

        const points = xValues
            .map((x, i) => ({
                x: Number(x),
                h: Number(hValues[i])
            }))
            .filter(p =>
                Number.isFinite(p.x) &&
                Number.isFinite(p.h)
            )
            .sort((a, b) => a.x - b.x);

        for (let i = 0; i < points.length - 1; i++) {

            const p1 = points[i];
            const p2 = points[i + 1];

            if (
                Number(xTarget) >= p1.x &&
                Number(xTarget) <= p2.x
            ) {
                const dx = p2.x - p1.x;

                if (Math.abs(dx) < 1e-12) {
                    return p1.h;
                }

                const f = (Number(xTarget) - p1.x) / dx;

                return p1.h + f * (p2.h - p1.h);
            }
        }

        return null;
    }

    function addMainLine(
        pointA,
        pointB,
        name,
        color,
        dash = "solid",
        width = 2.5
    ) {
        if (!pointA || !pointB) return;

        const x1 = Number(pointA.x);
        const h1 = Number(pointA.h);
        const x2 = Number(pointB.x);
        const h2 = Number(pointB.h);

        if (![x1, h1, x2, h2].every(Number.isFinite)) {
            console.warn(`Invalid line coordinates: ${name}`, pointA, pointB);
            return;
        }

        traces.push({
            x: [x1, x2],
            y: [h1, h2],
            type: "scatter",
            mode: "lines",
            name: name,
            line: {
                color: color,
                width: width,
                dash: dash
            },
            hovertemplate:
                name + "<br>" +
                "x = %{x:.4f}<br>" +
                "h = %{y:.3f} kJ/mol<extra></extra>"
        });
    }

    function addVerticalMainLine(
        x,
        h1,
        h2,
        name,
        color,
        dash = "dash"
    ) {
        x = Number(x);
        h1 = Number(h1);
        h2 = Number(h2);

        if (![x, h1, h2].every(Number.isFinite)) return;

        traces.push({
            x: [x, x],
            y: [h1, h2],
            type: "scatter",
            mode: "lines",
            name: name,
            line: {
                color: color,
                width: 3,
                dash: dash
            },
            hovertemplate:
                name + "<br>" +
                "x = %{x:.4f}<br>" +
                "h = %{y:.3f} kJ/mol<extra></extra>"
        });
    }

    // ==================================================
    // VLLE COMPOSITION INTERVAL
    // ==================================================

    let vlleMin = null;
    let vlleMax = null;

    if (
        data.vlle &&
        Array.isArray(data.vlle.x) &&
        data.vlle.x.length >= 2
    ) {
        const values = [
            Number(data.vlle.x[0]),
            Number(data.vlle.x[1]),
            Number(data.vlle.y)
        ].filter(Number.isFinite);

        if (values.length >= 2) {
            vlleMin = Math.min(...values);
            vlleMax = Math.max(...values);
        }
    }

    // ==================================================
    // ISOTHERMS
    // ==================================================

    if (Array.isArray(data.isotherms)) {

        data.isotherms.forEach(iso => {

            if (
                !Array.isArray(iso.x) ||
                !Array.isArray(iso.h) ||
                iso.x.length !== iso.h.length
            ) return;

            const temperatureK = getTemperatureK(iso);

            // Suppress VLE isotherms inside the VLLE interval.
            if (
                iso.type === "vle" &&
                vlleMin !== null &&
                vlleMax !== null
            ) {
                const isoX = iso.x.map(Number).filter(Number.isFinite);

                if (
                    isoX.length > 0 &&
                    isoX.every(x =>
                        x >= vlleMin - 1e-8 &&
                        x <= vlleMax + 1e-8
                    )
                ) {
                    return;
                }
            }

            traces.push({
                x: iso.x,
                y: iso.h,
                type: "scatter",
                mode: "lines",
                showlegend: false,
                line: {
                    color: "#888888",
                    width: 1.5,
                    dash: "dash"
                },
                hovertemplate:
                    "mole fraction = %{x:.4f}<br>" +
                    "h = %{y:.3f} kJ/mol" +
                    "<extra>Isotherm</extra>"
            });

            const validPoints = iso.x
                .map((x, i) => ({
                    x: Number(x),
                    h: Number(iso.h[i])
                }))
                .filter(p =>
                    Number.isFinite(p.x) &&
                    Number.isFinite(p.h)
                );

            if (temperatureK !== null && validPoints.length > 0) {

                const meanX = validPoints.reduce(
                    (sum, p) => sum + p.x, 0
                ) / validPoints.length;

                const meanH = validPoints.reduce(
                    (sum, p) => sum + p.h, 0
                ) / validPoints.length;

                addTemperatureLabel(
                    meanX,
                    meanH,
                    temperatureK,
                    iso.type === "vle" ? -90 : 0
                );
            }
        });
    }

    // ==================================================
    // LLE REGION: BINODAL CURVES AND TIE-LINES
    // ==================================================

    if (data.lle) {

        const lle = data.lle;

        const x1 = lle.x1 || [];
        const x2 = lle.x2 || [];
        const h1 = lle.h1 || [];
        const h2 = lle.h2 || [];

        const lleT =
            lle.T ||
            lle.temperature ||
            lle.temperature_C ||
            [];

        const n = Math.min(
            x1.length,
            x2.length,
            h1.length,
            h2.length,
            lleT.length
        );

        if (n > 1) {

            traces.push({
                x: x1.slice(0, n),
                y: h1.slice(0, n),
                type: "scatter",
                mode: "lines",
                name: "LLE phase 1",
                legendgroup: "LLE",
                line: {
                    color: "#c00000",
                    width: 3
                },
                hovertemplate:
                    "LLE phase 1<br>" +
                    "x = %{x:.4f}<br>" +
                    "h = %{y:.3f} kJ/mol<extra></extra>"
            });

            traces.push({
                x: x2.slice(0, n),
                y: h2.slice(0, n),
                type: "scatter",
                mode: "lines",
                name: "LLE phase 2",
                legendgroup: "LLE",
                line: {
                    color: "#c00000",
                    width: 3
                },
                hovertemplate:
                    "LLE phase 2<br>" +
                    "x = %{x:.4f}<br>" +
                    "h = %{y:.3f} kJ/mol<extra></extra>"
            });
        }

        // LLE tie-lines only on subcooled-liquid isotherms.
        if (Array.isArray(data.isotherms)) {

            data.isotherms.forEach(iso => {

                if (
                    iso.type !== "subcooled-liquid" ||
                    !Array.isArray(iso.x) ||
                    !Array.isArray(iso.h) ||
                    iso.x.length !== iso.h.length
                ) return;

                const temperatureK = getTemperatureK(iso);

                if (temperatureK === null) return;

                const temperatureC = temperatureK - 273.15;

                function interpolateLLE(values) {

                    const points = [];

                    for (let i = 0; i < n; i++) {

                        const T = Number(lleT[i]);
                        const value = Number(values[i]);

                        if (
                            Number.isFinite(T) &&
                            Number.isFinite(value)
                        ) {
                            points.push({ T, value });
                        }
                    }

                    points.sort((a, b) => a.T - b.T);

                    for (let i = 0; i < points.length - 1; i++) {

                        const p1 = points[i];
                        const p2 = points[i + 1];

                        if (
                            temperatureC >= p1.T &&
                            temperatureC <= p2.T
                        ) {
                            const dT = p2.T - p1.T;

                            if (Math.abs(dT) < 1e-12) {
                                return p1.value;
                            }

                            const f = (temperatureC - p1.T) / dT;

                            return p1.value +
                                f * (p2.value - p1.value);
                        }
                    }

                    return null;
                }

                const xLLE1 = interpolateLLE(x1);
                const xLLE2 = interpolateLLE(x2);

                if (xLLE1 === null || xLLE2 === null) return;

                const hLLE1 = interpolate(iso.x, iso.h, xLLE1);
                const hLLE2 = interpolate(iso.x, iso.h, xLLE2);

                if (hLLE1 === null || hLLE2 === null) return;

                traces.push({
                    x: [xLLE1, xLLE2],
                    y: [hLLE1, hLLE2],
                    type: "scatter",
                    mode: "lines",
                    name: "LLE tie-lines",
                    legendgroup: "LLE",
                    showlegend: false,
                    line: {
                        color: "#c00000",
                        width: 3,
                        dash: "dot"
                    },
                    hovertemplate:
                        "LLE tie-line<br>" +
                        "xP1 = " + xLLE1.toFixed(4) + "<br>" +
                        "xP2 = " + xLLE2.toFixed(4) + "<br>" +
                        "hP1 = " + hLLE1.toFixed(3) + " kJ/mol<br>" +
                        "hP2 = " + hLLE2.toFixed(3) + " kJ/mol<br>" +
                        "T = " + temperatureK.toFixed(2) + " K" +
                        "<extra></extra>"
                });
            });
        }
    }

    // ==================================================
    // LIQUID ENTHALPY CURVE / VLLE REPLACEMENT
    // ==================================================

    if (
        Array.isArray(data.x) &&
        Array.isArray(data.h_liquid)
    ) {

        const vlle = data.vlle;

        let vlleValid = false;
        let x1, x2, h1, h2;

        if (
            vlle &&
            Array.isArray(vlle.x) &&
            Array.isArray(vlle.h_liquid) &&
            vlle.x.length >= 2 &&
            vlle.h_liquid.length >= 2
        ) {
            x1 = Number(vlle.x[0]);
            x2 = Number(vlle.x[1]);
            h1 = Number(vlle.h_liquid[0]);
            h2 = Number(vlle.h_liquid[1]);

            vlleValid =
                [x1, x2, h1, h2].every(Number.isFinite) &&
                x1 !== x2;
        }

        if (vlleValid) {

            if (x1 > x2) {
                [x1, x2] = [x2, x1];
                [h1, h2] = [h2, h1];
            }

            const left = [];
            const right = [];

            data.x.forEach((value, i) => {

                const xi = Number(value);
                const hi = Number(data.h_liquid[i]);

                if (!Number.isFinite(xi) || !Number.isFinite(hi)) {
                    return;
                }

                if (xi < x1) left.push({ x: xi, h: hi });
                if (xi > x2) right.push({ x: xi, h: hi });
            });

            traces.push({
                x: [...left.map(p => p.x), x1],
                y: [...left.map(p => p.h), h1],
                type: "scatter",
                mode: "lines",
                name: "Liquid enthalpy",
                line: {
                    color: "#156082",
                    width: 3
                },
                hovertemplate:
                    "x = %{x:.4f}<br>" +
                    "hL = %{y:.3f} kJ/mol" +
                    "<extra>Liquid enthalpy</extra>"
            });

            traces.push({
                x: [x1, x2],
                y: [h1, h2],
                type: "scatter",
                mode: "lines",
                name: "VLLE boiling-line section",
                line: {
                    color: "#16a34a",
                    width: 3,
                    dash: "dash"
                },
                hovertemplate:
                    "VLLE boiling-line section<br>" +
                    "x = %{x:.4f}<br>" +
                    "hL = %{y:.3f} kJ/mol<extra></extra>"
            });

            traces.push({
                x: [x2, ...right.map(p => p.x)],
                y: [h2, ...right.map(p => p.h)],
                type: "scatter",
                mode: "lines",
                name: "Liquid enthalpy (right side)",
                showlegend: false,
                line: {
                    color: "#156082",
                    width: 3
                },
                hovertemplate:
                    "x = %{x:.4f}<br>" +
                    "hL = %{y:.3f} kJ/mol" +
                    "<extra>Liquid enthalpy</extra>"
            });

        } else {

            traces.push({
                x: data.x,
                y: data.h_liquid,
                type: "scatter",
                mode: "lines",
                name: "Liquid enthalpy",
                line: {
                    color: "#156082",
                    width: 3
                },
                hovertemplate:
                    "x = %{x:.4f}<br>" +
                    "hL = %{y:.3f} kJ/mol" +
                    "<extra></extra>"
            });
        }
    }

    // ==================================================
    // VAPOR ENTHALPY CURVE
    // ==================================================

    if (
        Array.isArray(data.y) &&
        Array.isArray(data.h_vapor)
    ) {
        traces.push({
            x: data.y,
            y: data.h_vapor,
            type: "scatter",
            mode: "lines",
            showlegend: "false",
            name: "Vapor enthalpy",
            line: {
                color: "#E97132",
                width: 3
            },
            hovertemplate:
                "y = %{x:.4f}<br>" +
                "hV = %{y:.3f} kJ/mol<extra></extra>" +
                "<extra>Vapor enthalpy</extra>"
        });
    }

    // ==================================================
    // VLLE ISOTHERM
    // ==================================================

    if (data.vlle) {

        const vlle = data.vlle;

        if (
            Array.isArray(vlle.x) &&
            Array.isArray(vlle.h_liquid) &&
            vlle.x.length >= 2 &&
            vlle.h_liquid.length >= 2
        ) {

            let x1 = Number(vlle.x[0]);
            let x2 = Number(vlle.x[1]);

            let h1 = Number(vlle.h_liquid[0]);
            let h2 = Number(vlle.h_liquid[1]);

            const yV = Number(vlle.y);
            const hV = Number(vlle.h_vapor);

            const temperatureK = getTemperatureK(vlle);

            if (x1 > x2) {
                [x1, x2] = [x2, x1];
                [h1, h2] = [h2, h1];
            }

            if (
                [x1, x2, h1, h2, yV, hV].every(Number.isFinite)
            ) {

                traces.push({
                    x: [x1, yV],
                    y: [h1, hV],
                    type: "scatter",
                    mode: "lines",
                    name: "VLLE isotherm",
                    legendgroup: "VLLE",
                    showlegend: false,
                    line: {
                        color: "#16a34a",
                        width: 2.5,
                        dash: "dash"
                    },
                    hovertemplate:
                        "VLLE isotherm<br>" +
                        "Liquid 1 x = " + x1.toFixed(4) + "<br>" +
                        "Vapor y = " + yV.toFixed(4) + "<br>" +
                        "h = %{y:.3f} kJ/mol<extra></extra>"
                });

                traces.push({
                    x: [x2, yV],
                    y: [h2, hV],
                    type: "scatter",
                    mode: "lines",
                    name: "VLLE isotherm",
                    legendgroup: "VLLE",
                    showlegend: false,
                    line: {
                        color: "#16a34a",
                        width: 3,
                        dash: "dash"
                    },
                    hovertemplate:
                        "VLLE isotherm<br>" +
                        "Liquid 2 x = " + x2.toFixed(4) + "<br>" +
                        "Vapor y = " + yV.toFixed(4) + "<br>" +
                        "h = %{y:.3f} kJ/mol<extra></extra>"
                });

                traces.push({
                    x: [x1, x2, yV],
                    y: [h1, h2, hV],
                    type: "scatter",
                    mode: "markers",
                    name: "VLLE equilibrium points",
                    legendgroup: "VLLE",
                    showlegend: false,
                    marker: {
                        color: "#16a34a",
                        size: 9,
                        symbol: "circle",
                        line: {
                            color: "#ffffff",
                            width: 1
                        }
                    },
                    hovertemplate:
                        "VLLE equilibrium point<br>" +
                        "mole fraction = %{x:.4f}<br>" +
                        "h = %{y:.3f} kJ/mol<extra></extra>"
                });

                if (temperatureK !== null) {
                    addTemperatureLabel(
                        (x1 + x2 + yV) / 3,
                        (h1 + h2 + hV) / 3,
                        temperatureK,
                        0,
                        "#16a34a"
                    );
                }
            }
        }
    }

    // ==================================================
    // AZEOTROPE
    // ==================================================

    if (data.azeotrope) {

        const azeotrope = data.azeotrope;

        const xAzeo = Number(azeotrope.x);
        const yAzeo = Number(azeotrope.y);

        const temperatureK = getTemperatureK(azeotrope);

        if (
            Number.isFinite(xAzeo) &&
            Number.isFinite(yAzeo)
        ) {

            const hL = interpolate(
                data.x,
                data.h_liquid,
                xAzeo
            );

            const hV = interpolate(
                data.y,
                data.h_vapor,
                yAzeo
            );

            if (hL !== null && hV !== null) {

                traces.push({
                    x: [xAzeo, yAzeo],
                    y: [hL, hV],
                    type: "scatter",
                    mode: "lines",
                    showlegend: false,
                    line: {
                        color: "#16a36a",
                        width: 2.5
                    },
                    hovertemplate:
                        "Azeotropic tie line<br>" +
                        "h = %{y:.3f} kJ/mol<extra></extra>"
                });

                if (temperatureK !== null) {
                    addTemperatureLabel(
                        (xAzeo + yAzeo) / 2,
                        (hL + hV) / 2,
                        temperatureK,
                        -90
                    );
                }
            }
        }
    }

    // ==================================================
    // PONCHON-SAVARIT STAGE CONSTRUCTION
    // ==================================================

    if (currentStageData) {

        console.log("Ponchon-Savarit stage data:", currentStageData);

        const stageColors = {
            rectifying: "#0097dd",
            stripping: "#ff0000",
            main: "#0205c7"
        };

        const op = currentStageData.operating_points || {};
        const pp = currentStageData.process_points || {};

        // --------------------------------------------------
        // PROCESS AND DIFFERENCE POINTS
        // --------------------------------------------------

        const A = pp.bottom || pp.A || op.A;
        const F = pp.feed || pp.F || op.F || currentStageData.feed_point;
        const E = pp.distillate || pp.E || op.E;

        const S = op.S;
        const D = op.D;

        console.table({
            A: A || null,
            F: F || null,
            E: E || null,
            S: S || null,
            D: D || null
        });

        // --------------------------------------------------
        // DIFFERENCE POINT MARKERS
        // --------------------------------------------------

        function addDifferencePoint(name, point, color) {

            if (!point) return;

            const px = Number(point.x);
            const ph = Number(point.h);

            if (![px, ph].every(Number.isFinite)) {
                console.warn(`Invalid difference point ${name}`, point);
                return;
            }

            traces.push({
                x: [px],
                y: [ph],
                type: "scatter",
                mode: "markers+text",
                name: name,
                marker: {
                    size: 11,
                    color: color,
                    symbol: ".",
                    line: {
                        color: "#222222",
                        width: 1
                    }
                },
                hovertemplate:
                    name + "<br>" +
                    "x = %{x:.4f}<br>" +
                    "h = %{y:.3f} kJ/mol<extra></extra>"
            });
        }

        // --------------------------------------------------
        // MAIN LINES
        // --------------------------------------------------

        addMainLine(
            S,
            D,
            "S-D difference-point line",
            stageColors.main,
            "solid",
            3
        );

        if (A && S) {
            addVerticalMainLine(
                Number(S.x),
                Number(S.h),
                Number(A.h),
                "A-S bottom construction",
                stageColors.main,
                "solid"
            );
        }

        if (D && E) {
            addVerticalMainLine(
                Number(D.x),
                Number(D.h),
                Number(E.h),
                "D-E distillate construction",
                stageColors.main,
                "solid"
            );
        }

        // --------------------------------------------------
        // DIFFERENCE POINT MARKERS
        // --------------------------------------------------

        addDifferencePoint("Δ<sup>B</sup>", S, stageColors.main);
        addDifferencePoint("Δ<sup>D</sup>", D, stageColors.main);

        // --------------------------------------------------
        // PROCESS POINT MARKERS
        // --------------------------------------------------

        [
            { name: "Feed", point: F },
            { name: "Bottom", point: A },
            { name: "Distillate", point: E }
        ].forEach(item => {

            if (!item.point) {
                console.warn(`Missing process point: ${item.name}`);
                return;
            }

            const px = Number(item.point.x);
            const ph = Number(item.point.h);

            if (![px, ph].every(Number.isFinite)) {
                console.warn(`Invalid process point: ${item.name}`, item.point);
                return;
            }

            traces.push({
                x: [px],
                y: [ph],
                type: "scatter",
                mode: "markers",
                name: item.name,
                marker: {
                    color: stageColors.main,
                    size: 10,
                    symbol: "circle",
                    line: {
                        width: 1.5
                    }
                },
                hovertemplate:
                    item.name + "<br>" +
                    "x = %{x:.4f}<br>" +
                    "h = %{y:.3f} kJ/mol<extra></extra>"
            });
        });

        // --------------------------------------------------
        // STAGE SECTIONS
        // --------------------------------------------------

        function addStageSection(
            stages,
            differencePoint,
            sectionName,
            color
        ) {

            console.log(
                `${sectionName} stage data:`,
                stages
            );

            if (!Array.isArray(stages) || !differencePoint) {
                console.warn(
                    `${sectionName}: stages or difference point missing.`
                );
                return;
            }

            const dx = Number(differencePoint.x);
            const dh = Number(differencePoint.h);

            if (![dx, dh].every(Number.isFinite)) {
                console.warn(`${sectionName}: invalid difference point.`);
                return;
            }

            stages.forEach((stage, index) => {

                const x = Number(stage.x);
                const y = Number(stage.y);
                const hL = Number(stage.h_liquid);
                const hV = Number(stage.h_vapor);

                if (![x, y, hL, hV].every(Number.isFinite)) {
                    console.warn(
                        `Invalid ${sectionName} stage ${index + 1}`,
                        stage
                    );
                    return;
                }

                // Equilibrium tie line
                traces.push({
                    x: [x, y],
                    y: [hL, hV],
                    type: "scatter",
                    mode: "lines+markers",
                    name: sectionName + " equilibrium stages",
                    legendgroup: sectionName,
                    line: {
                        color: color,
                        width: 2,
                        dash: "dash"
                    },
                    marker: {
                        color: color,
                        size: 9
                    },
                    hovertemplate:
                        "Stage " + (index + 1) + "<br>" +
                        "Liquid x = " + x.toFixed(4) + "<br>" +
                        "Vapor y = " + y.toFixed(4) + "<br>" +
                        "hL = " + hL.toFixed(3) + " kJ/mol<br>" +
                        "hV = " + hV.toFixed(3) + " kJ/mol" +
                        "<extra></extra>"
                });

                // Operating construction
                const operatingX =
                    sectionName === "Rectifying"
                        ? [x, dx]
                        : [y, dx];

                const operatingH =
                    sectionName === "Rectifying"
                        ? [hL, dh]
                        : [hV, dh];

                traces.push({
                    x: operatingX,
                    y: operatingH,
                    type: "scatter",
                    mode: "lines",
                    name: sectionName + " operating construction",
                    legendgroup: sectionName,
                    showlegend: false,
                    line: {
                        color: color,
                        width: 2
                    },
                    hovertemplate:
                        sectionName + " operating construction<br>" +
                        "x = %{x:.4f}<br>" +
                        "h = %{y:.3f} kJ/mol<extra></extra>"
                });

            });
        }

        // Rectifying stages
        addStageSection(
            currentStageData.rectifying_stages_data,
            D,
            "Rectifying",
            stageColors.rectifying
        );

        // Stripping stages
        const strippingStages =
            currentStageData.stripping_stages_data || [];

        // Der letzte Eintrag ist nur der abschließende
        // Schnittpunkt mit der Siedelinie und keine volle Stufe.
        const strippingStagesToPlot =
            strippingStages.length > 0
                ? strippingStages.slice(0, -1)
                : [];

        addStageSection(
            strippingStagesToPlot,
            S,
            "Stripping",
            stageColors.stripping
        );

        if (currentStageData.caloric_factors) {
            console.table(currentStageData.caloric_factors);
        }

        console.log(
            "Number of plotted traces after stage construction:",
            traces.length
        );

    } else {
        console.log(
            "No Ponchon-Savarit stage data available."
        );
    }


    // ==================================================
    // LAYOUT
    // ==================================================

    const hasValidVleScale =
        isValidAxisRange(hxyVleXRange) &&
        isValidAxisRange(hxyVleYRange);

    const useVleRange =
        hxyScaleMode === "vle" && hasValidVleScale;

    console.log("HXY LAYOUT SCALE:", {
        mode: hxyScaleMode,
        useVleRange,
        savedX: hxyVleXRange,
        savedY: hxyVleYRange
    });

    const layout = plotLayout(
        xTitle,
        yTitle,
        {
            uirevision: hxyScaleRevision,

            xaxis: {
                title: {
                    text: xTitle
                },
                ...(useVleRange
                    ? {
                        range: [...hxyVleXRange],
                        autorange: false
                    }
                    : {
                        range: [0, 1],
                        autorange: false
                    })
            },

            yaxis: {
                title: {
                    text: yTitle
                },
                ...(useVleRange
                    ? {
                        range: [...hxyVleYRange],
                        autorange: false
                    }
                    : {
                        autorange: true
                    })
            },

            annotations: annotations,
            hovermode: "closest"
        }
    );


    // ==================================================
    // RENDER
    // ==================================================

    console.log("Final enthalpy traces:", traces.length);
    console.log("Final enthalpy annotations:", annotations.length);

    return renderPlot(
        traces,
        layout,
        "No enthalpy data available."
    );
}


// ==================================================
// Y-X DIAGRAM
// ==================================================



function drawYXDiagram() {

    const xTitle = "Liquid mole fraction x";
    const yTitle = "Vapor mole fraction y";

    if (!vleData) {

        renderPlot(
            [],
            plotLayout(xTitle, yTitle),
            "Please calculate VLE first."
        );

        return;
    }

    const x = numericArray(vleData.x);
    const y = numericArray(vleData.y);

    if (!validArrays(x, y)) {

        renderPlot(
            [],
            plotLayout(xTitle, yTitle),
            "Invalid or incomplete VLE data."
        );

        return;
    }

    const isWaterButanol =
        $("mixture").value === "water-1-butanol";

    const azeotrope = vleData.azeotrope || {};
    const vlle = vleData.vlle || {};

    const hasVLLE =
        isWaterButanol &&
        Array.isArray(vlle.x) &&
        vlle.x.length === 2 &&
        Number.isFinite(Number(vlle.y));

    const x1 = hasVLLE ? Number(vlle.x[0]) : null;
    const x2 = hasVLLE ? Number(vlle.x[1]) : null;
    const y3 = hasVLLE ? Number(vlle.y) : null;

    const traces = [];

    // Composition guides
    if (stageData) {

        [
            { value: Number($("distillate").value), label: "xD" },
            { value: Number($("feed").value), label: "zF" },
            { value: Number($("bottom").value), label: "xB" }
        ]

        .filter(item =>
            Number.isFinite(item.value) &&
            item.value >= 0 &&
            item.value <= 1
        )

        .forEach(item => {

            traces.push({

                x: [item.value, item.value],
                y: [0, item.value],

                type: "scatter",
                mode: "lines",

                name: `${item.label} guide`,

                line: {
                    color: "#8795a1",
                    width: 2,
                    dash: "dash"
                },

                hovertemplate:
                    `${item.label} = ${item.value.toFixed(4)}` +
                    "<extra></extra>"

            });

        });
    }


    // Diagonal
    traces.push({

        x: [0, 1],
        y: [0, 1],

        type: "scatter",
        mode: "lines",

        name: "Diagonal (y = x)",

        line: {
            color: "#98a2b3",
            width: 2
        }

    });


    // Equilibrium curve
    let equilibriumY = [...y];

    if (hasVLLE) {

        const lowerX = Math.min(x1, x2);
        const upperX = Math.max(x1, x2);

        equilibriumY = y.map((value, i) =>
            x[i] > lowerX && x[i] < upperX
                ? null
                : value
        );
    }

    traces.push({

        x: x,
        y: equilibriumY,

        type: "scatter",
        mode: "lines",

        connectgaps: false,

        name: "Equilibrium curve",

        line: {
            color: "#2878b8",
            width: 3
        },

        hovertemplate:
            "Liquid x = %{x:.4f}<br>" +
            "Vapor y = %{y:.4f}" +
            "<extra>VLE</extra>"

    });


function addFeedLineYX(traces, stageData, vleX, vleY) {

    if (!stageData || !Array.isArray(stageData.q)) return;

    const xF = Number(stageData.feed);
    const qF = Number(stageData.q[1]);

    if (!Number.isFinite(xF) || !Number.isFinite(qF)) return;

    const slope = Math.abs(qF - 1) < 1e-8
        ? null
        : qF / (qF - 1);

    let intersection = null;

    // VLE-Daten bereinigen
    const points = [];

    for (let i = 0; i < vleX.length; i++) {

        const xi = Number(vleX[i]);
        const yi = Number(vleY[i]);

        if (Number.isFinite(xi) && Number.isFinite(yi)) {
            points.push({ x: xi, y: yi });
        }
    }

    // Sonderfall: qF = 1 -> vertikale Feedlinie
    if (slope === null) {

        for (let i = 0; i < points.length - 1; i++) {

            const p1 = points[i];
            const p2 = points[i + 1];

            if (
                xF >= Math.min(p1.x, p2.x) &&
                xF <= Math.max(p1.x, p2.x) &&
                Math.abs(p2.x - p1.x) > 1e-12
            ) {

                const t = (xF - p1.x) / (p2.x - p1.x);

                intersection = {
                    x: xF,
                    y: p1.y + t * (p2.y - p1.y)
                };

                break;
            }
        }

    } else {

        // Schnittpunkt zwischen q-Linie und VLE-Kurve
        for (let i = 0; i < points.length - 1; i++) {

            const p1 = points[i];
            const p2 = points[i + 1];

            const g1 = p1.y - (xF + slope * (p1.x - xF));
            const g2 = p2.y - (xF + slope * (p2.x - xF));

            if (
                Math.abs(g1) < 1e-10 ||
                g1 * g2 < 0 ||
                Math.abs(g2) < 1e-10
            ) {

                const denominator = g1 - g2;

                if (Math.abs(denominator) < 1e-12) continue;

                const t = g1 / denominator;

                intersection = {
                    x: p1.x + t * (p2.x - p1.x),
                    y: p1.y + t * (p2.y - p1.y)
                };

                break;
            }
        }
    }

    if (!intersection) {

        console.warn("Feed line: No intersection found.", {
            xF,
            qF,
            slope,
            vleX,
            vleY
        });

        return;
    }

    traces.push({

        x: [xF, intersection.x],
        y: [xF, intersection.y],

        type: "scatter",
        mode: "lines",

        name: "Feed line",

        line: {
            color: "#8795a1",
            width: 2,
            dash: "dash"
        },

        hovertemplate:
            "x = %{x:.4f}<br>" +
            "y = %{y:.4f}" +
            "<extra>Feed line</extra>"
    });
}

addFeedLineYX(
    traces,
    stageData,
    x,
    y
);



function addStageConstructionYX(traces, z, section) {
    if (!Array.isArray(z) || z.length < 4) return;

    const xVertical = [];
    const yVertical = [];

    const xHorizontal = [];
    const yHorizontal = [];

    const xDiagonal = [];
    const yDiagonal = [];

    for (let i = 0; i < z.length; i += 3) {
        if (i + 3 >= z.length) break;

        if (section === "stripping") {
            // Vertikale Linie
            if (i === 0) {
                xVertical.push(z[i], z[i], null);
                yVertical.push(z[i], z[i + 1], null);
            } else {
                xVertical.push(z[i], z[i], null);
                yVertical.push(z[i - 2], z[i + 1], null);
            }

            // Diagonale Verbindung
            if (i === 0) {
                xDiagonal.push(z[i], z[i + 3], null);
                yDiagonal.push(z[i], z[i + 1], null);
            } else {
                xDiagonal.push(z[i], z[i + 3], null);
                yDiagonal.push(z[i - 2], z[i + 1], null);
            }

            // Horizontale Linie
            xHorizontal.push(z[i], z[i + 3], null);
            yHorizontal.push(z[i + 1], z[i + 1], null);

        } else if (section === "rectifying") {
            // Horizontale Linie
            if (i === 0) {
                xHorizontal.push(z[i], z[i + 1], null);
                yHorizontal.push(z[i], z[i], null);
            } else {
                xHorizontal.push(z[i - 2], z[i + 1], null);
                yHorizontal.push(z[i], z[i], null);
            }

            // Diagonale Verbindung
            if (i === 0) {
                xDiagonal.push(z[i], z[i + 1], null);
                yDiagonal.push(z[i], z[i + 3], null);
            } else {
                xDiagonal.push(z[i - 2], z[i + 1], null);
                yDiagonal.push(z[i], z[i + 3], null);
            }

            // Vertikale Linie
            xVertical.push(z[i + 1], z[i + 1], null);
            yVertical.push(z[i], z[i + 3], null);
        }
    }

    // Schwarze Stufenlinien
    traces.push({
        x: xVertical,
        y: yVertical,
        type: "scatter",
        mode: "lines",
        name: section === "stripping"
            ? "Stripping vertical"
            : "Rectifying vertical",
        line: {
            width: 2,
            color: section === "stripping"
                ? "#ff0000"
                : "#0097dd",
        },
        connectgaps: false,
        showlegend: true
    });

    traces.push({
        x: xHorizontal,
        y: yHorizontal,
        type: "scatter",
        mode: "lines",
        name: section === "stripping"
            ? "Stripping horizontal"
            : "Rectifying horizontal",
        line: {
            width: 2,
            color: section === "stripping"
                ? "#ff0000"
                : "#0097dd",
            
        },
        connectgaps: false,
        showlegend: false
    });

    // Farbige Verbindung wie in MATLAB
    traces.push({
        x: xDiagonal,
        y: yDiagonal,
        type: "scatter",
        mode: "lines",
        name: section === "stripping"
            ? "Stripping connection"
            : "Enriching connection",
        line: {  
            width: 2,       
            color: section === "stripping"
                ? "#ff0000"
                : "#0097dd",
                
        },
        connectgaps: false,
        showlegend: false
    });
}



    // Current equilibrium stages from H-x-y calculation
if (stageData && stageData.construction) {

    // Abtriebsteil
    addStageConstructionYX(
        traces,
        stageData.construction.stripping?.z,
        "stripping"
    );

    // Verstärkerteil
    addStageConstructionYX(
        traces,
        stageData.construction.rectifying?.z,
        "rectifying"
    );
}



    // Historical stage constructions
    const stageColors = [
        "#f91693",
        "#16a36a",
        "#7c3aed",
        "#d97735",
        "#0891b2",
        "#dc2626"
    ];

    stageHistory.forEach((result, index) => {

        const color = stageColors[index % stageColors.length];
        const label = `Calculation ${index + 1}`;

        const rect = result.rectifying_line || {};
        const strip = result.stripping_line || {};


        if (Number.isFinite(Number(rect.slope))) {

            traces.push({

                x: rect.x_values || [0, 1],

                y: rect.y_values || [
                    Number(rect.intercept),
                    Number(rect.slope) + Number(rect.intercept)
                ],

                type: "scatter",
                mode: "lines",

                name: `Enriching line – ${label}`,

                line: {
                    color,
                    width: 2,
                    dash: "dot"
                }

            });
        }


        if (Number.isFinite(Number(strip.slope))) {

            traces.push({

                x: strip.x_values || [0, 1],

                y: strip.y_values || [
                    Number(strip.intercept),
                    Number(strip.slope) + Number(strip.intercept)
                ],

                type: "scatter",
                mode: "lines",

                name: `Stripping line – ${label}`,

                line: {
                    color,
                    width: 2,
                    dash: "dot"
                }

            });
        }


        if (
            Array.isArray(result.stage_x) &&
            Array.isArray(result.stage_y)
        ) {

            traces.push({

                x: result.stage_x,
                y: result.stage_y,

                type: "scatter",
                mode: "lines",

                name: `Stage construction – ${label}`,

                line: {
                    color,
                    width: 2.5
                }

            });
        }


        const qline = result.q_line || {};

        if (qline.vertical) {

            traces.push({

                x: [qline.x, qline.x],

                y: [
                    qline.y_start ?? 0,
                    qline.y_end ?? 1
                ],

                type: "scatter",
                mode: "lines",

                name: `q-line – ${label}`,

                line: {
                    color,
                    dash: "dash"
                }

            });

        } else if (
            Array.isArray(qline.x_values) &&
            qline.x_values.length
        ) {

            traces.push({

                x: qline.x_values,
                y: qline.y_values,

                type: "scatter",
                mode: "lines",

                name: `q-line – ${label}`,

                line: {
                    color,
                    dash: "dash"
                }

            });
        }

    });


    // Three heterogeneous azeotrope points
    if (
        hasVLLE &&
        [x1, x2, y3].every(Number.isFinite) &&
        [x1, x2, y3].every(value =>
            value >= 0 && value <= 1
        )
    ) {

        traces.push({

            x: [x1, x2],
            y: [y3, y3],

            type: "scatter",
            mode: "lines",

            name: "VLLE tie line",

            line: {
                color: "#16a34a",
                width: 3,
                dash: "dash"
            },

            hovertemplate:
                "VLLE tie line<br>" +
                "x = %{x:.4f}<br>" +
                "y = %{y:.4f}" +
                "<extra></extra>"

        });


        traces.push({

            x: [x1, x2, y3],
            y: [y3, y3, y3],

            type: "scatter",
            mode: "markers",

            name: "Heterogeneous azeotrope points",

            text: [
                "Liquid phase 1",
                "Liquid phase 2",
                "Vapor phase"
            ],

            marker: {
                size: 13,
                color: "#16a34a",

                line: {
                    color: "#ffffff",
                    width: 2
                }
            },

            hovertemplate:
                "%{text}<br>" +
                "Composition = %{x:.4f}<br>" +
                "Vapor composition = %{y:.4f}" +
                "<extra>Heterogeneous azeotrope</extra>"

        });

    } else if (
        azeotrope.exists &&
        Number.isFinite(Number(azeotrope.x)) &&
        Number.isFinite(Number(azeotrope.y))
    ) {

        traces.push({

            x: [Number(azeotrope.x)],
            y: [Number(azeotrope.y)],

            type: "scatter",
            mode: "markers",

            name: "Azeotrope",

            marker: {
                size: 12,
                color: "#16a36a",

                line: {
                    color: "#ffffff",
                    width: 2
                }
            }

        });
    }


    const layout = plotLayout(
        xTitle,
        yTitle,
        {
            xaxis: {
                title: { text: xTitle },
                range: [0, 1],
                constrain: "domain",
                tickformat: ".1f"
            },

            yaxis: {
                title: { text: yTitle },
                range: [0, 1],
                scaleanchor: "x",
                scaleratio: 1,
                tickformat: ".1f"
            },

            margin: {
                l: 75,
                r: 40,
                t: 35,
                b: 75,
                autoexpand: true
            }
        }
    );

    renderPlot(
        traces,
        layout,
        `Calculated VLE curve: ${vleData.mixture}, ${vleData.pressure} bar.`
    );
}


// ==================================================
// T-X-Y DIAGRAM
// ==================================================



function drawTXYDiagram() {

    const xTitle = "Mole fraction x, y";
    const yTitle = "Temperature / K";

    if (!vleData) {

        renderPlot(
            [],
            plotLayout(xTitle, yTitle),
            "Please calculate VLE first."
        );

        return;
    }

    const x = numericArray(vleData.x);
    const y = numericArray(vleData.y);
    const temperature = numericArray(vleData.temperature);

    if (!validArrays(x, y, temperature)) {

        renderPlot(
            [],
            plotLayout(xTitle, yTitle),
            "Temperature-composition data is incomplete or invalid."
        );

        return;
    }

    const isWaterButanol =
        $("mixture").value === "water-1-butanol";

    const vlle = vleData.vlle || {};
    const azeotrope = vleData.azeotrope || {};

    const hasVLLE =
        isWaterButanol &&
        Array.isArray(vlle.x) &&
        vlle.x.length === 2 &&
        Number.isFinite(Number(vlle.y)) &&
        Number.isFinite(Number(vlle.temperature));

    const traces = [];

    let x1 = null;
    let x2 = null;
    let y3 = null;
    let Tvlle = null;

    if (hasVLLE) {

        x1 = Number(vlle.x[0]);
        x2 = Number(vlle.x[1]);
        y3 = Number(vlle.y);
        Tvlle = Number(vlle.temperature);

    }


    // --------------------------------------------------
    // 1. BUBBLE-POINT CURVE
    // --------------------------------------------------

    if (hasVLLE) {

        const lowerX = Math.min(x1, x2);
        const upperX = Math.max(x1, x2);

        const leftX = [];
        const leftT = [];

        const rightX = [];
        const rightT = [];

        x.forEach((value, i) => {

            if (value < lowerX) {

                leftX.push(value);
                leftT.push(temperature[i]);

            } else if (value > upperX) {

                rightX.push(value);
                rightT.push(temperature[i]);

            }

        });


        traces.push({

            x: leftX,
            y: leftT,

            type: "scatter",
            mode: "lines",

            name: "Bubble-point curve",

            line: {
                color: "#2878b8",
                width: 3
            },

            hovertemplate:
                "Liquid composition x = %{x:.4f}<br>" +
                "Temperature = %{y:.2f} K" +
                "<extra>Bubble point</extra>"

        });


        traces.push({

            x: rightX,
            y: rightT,

            type: "scatter",
            mode: "lines",

            name: "Bubble-point curve",
            showlegend: false,

            line: {
                color: "#2878b8",
                width: 3
            },

            hovertemplate:
                "Liquid composition x = %{x:.4f}<br>" +
                "Temperature = %{y:.2f} K" +
                "<extra>Bubble point</extra>"

        });

    } else {

        traces.push({

            x: x,
            y: temperature,

            type: "scatter",
            mode: "lines",

            name: "Bubble-point curve",

            line: {
                color: "#2878b8",
                width: 3
            },

            hovertemplate:
                "Liquid composition x = %{x:.4f}<br>" +
                "Temperature = %{y:.2f} K" +
                "<extra>Bubble point</extra>"

        });
    }


    // --------------------------------------------------
    // 2. DEW-POINT CURVE
    // --------------------------------------------------

    if (hasVLLE) {

        const lowerX = Math.min(x1, x2);
        const upperX = Math.max(x1, x2);

        const dewX = [];
        const dewT = [];

        x.forEach((liquidComposition, i) => {

            const vaporComposition = y[i];

            if (
                liquidComposition < lowerX ||
                liquidComposition > upperX
            ) {

                dewX.push(vaporComposition);
                dewT.push(temperature[i]);

            }

        });

        traces.push({

            x: dewX,
            y: dewT,

            type: "scatter",
            mode: "lines",

            name: "Dew-point curve",

            line: {
                color: "#d97735",
                width: 3
            },

            hovertemplate:
                "Vapor composition y = %{x:.4f}<br>" +
                "Temperature = %{y:.2f} K" +
                "<extra>Dew point</extra>"

        });

    } else {

        traces.push({

            x: y,
            y: temperature,

            type: "scatter",
            mode: "lines",

            name: "Dew-point curve",

            line: {
                color: "#d97735",
                width: 3
            },

            hovertemplate:
                "Vapor composition y = %{x:.4f}<br>" +
                "Temperature = %{y:.2f} K" +
                "<extra>Dew point</extra>"

        });
    }


    // --------------------------------------------------
    // 3. LIQUID-LIQUID EQUILIBRIUM
    // --------------------------------------------------

    const lle = vleData.lle || {};

    if (
        isWaterButanol &&
        Array.isArray(lle.x) &&
        lle.x.length === 2 &&
        Array.isArray(lle.temperature)
    ) {

        const liquidPhase1 = numericArray(lle.x[0]);
        const liquidPhase2 = numericArray(lle.x[1]);
        const lleTemperature = numericArray(lle.temperature);

        if (
            validArrays(liquidPhase1, lleTemperature) &&
            validArrays(liquidPhase2, lleTemperature)
        ) {

            traces.push({

                x: liquidPhase1,
                y: lleTemperature,

                type: "scatter",
                mode: "lines",

                name: "LLE – Liquid phase 1",

                line: {
                    color: "#c00000",
                    width: 2.5
                },

                hovertemplate:
                    "Liquid phase 1: x = %{x:.4f}<br>" +
                    "Temperature = %{y:.2f} K" +
                    "<extra>LLE</extra>"

            });


            traces.push({

                x: liquidPhase2,
                y: lleTemperature,

                type: "scatter",
                mode: "lines",

                name: "LLE – Liquid phase 2",

                line: {
                    color: "#c00000",
                    width: 2.5
                },

                hovertemplate:
                    "Liquid phase 2: x = %{x:.4f}<br>" +
                    "Temperature = %{y:.2f} K" +
                    "<extra>LLE</extra>"

            });

        }
    }


    // --------------------------------------------------
    // 4. STAGE CONSTRUCTION
    // --------------------------------------------------

    if (stageData) {

        function addTXYStages(stages, section, color) {

            if (!Array.isArray(stages) || stages.length === 0) {
                return;
            }

            const tieX = [];
            const tieT = [];

            const connectionX = [];
            const connectionT = [];

            const liquidX = [];
            const liquidT = [];

            const vaporX = [];
            const vaporT = [];

            stages.forEach((stage, i) => {

                const liquid = Number(stage.x);
                const vapor = Number(stage.y);
                const temp = Number(stage.temperature);

                if (
                    !Number.isFinite(liquid) ||
                    !Number.isFinite(vapor) ||
                    !Number.isFinite(temp)
                ) {
                    return;
                }

                // Equilibrium tie line
                tieX.push(liquid, vapor, null);

                tieT.push(
                    temp + 273.15,
                    temp + 273.15,
                    null
                );

                // Liquid points
                liquidX.push(liquid);
                liquidT.push(temp + 273.15);

                // Vapor points
                vaporX.push(vapor);
                vaporT.push(temp + 273.15);

                // Connection to next stage in same section
                if (i < stages.length - 1) {

                    const nextStage = stages[i + 1];

                    const nextLiquid = Number(nextStage.x);
                    const nextTemp = Number(nextStage.temperature);

                    if (
                        Number.isFinite(nextLiquid) &&
                        Number.isFinite(nextTemp)
                    ) {

                        connectionX.push(
                            vapor,
                            nextLiquid,
                            null
                        );

                        connectionT.push(
                            temp + 273.15,
                            nextTemp + 273.15,
                            null
                        );
                    }
                }
            });


            if (tieX.length > 0) {

                // Equilibrium tie lines
                traces.push({

                    x: tieX,
                    y: tieT,

                    type: "scatter",
                    mode: "lines",

                    name: `${section} equilibrium tie lines`,

                    connectgaps: false,

                    line: {
                        color: color,
                        width: 2,
                        dash: "dash"
                    },

                    hoverinfo: "skip"

                });
            }


            if (connectionX.length > 0) {

                // Stage connections
                traces.push({

                    x: connectionX,
                    y: connectionT,

                    type: "scatter",
                    mode: "lines",

                    name: `${section} stage connections`,

                    connectgaps: false,

                    line: {
                        color: color,
                        width: 2
                    },

                    hoverinfo: "skip"

                });
            }


            if (liquidX.length > 0) {

                // Liquid points
                traces.push({

                    x: liquidX,
                    y: liquidT,

                    type: "scatter",
                    mode: "markers",

                    name: `${section} liquid points`,

                    marker: {
                        color: color,
                        size: 9,
                        symbol: "circle"
                    }

                });
            }


            if (vaporX.length > 0) {

                // Vapor points
                traces.push({

                    x: vaporX,
                    y: vaporT,

                    type: "scatter",
                    mode: "markers",

                    name: `${section} vapor points`,

                    marker: {
                        color: color,
                        size: 9,
                        symbol: "diamond"
                    }

                });
            }
        }


        const rectifyingStages =
            Array.isArray(stageData.rectifying_stages_data)
                ? stageData.rectifying_stages_data
                : [];

        const strippingStages =
            Array.isArray(stageData.stripping_stages_data)
                ? stageData.stripping_stages_data
                : [];


        // Rectifying section
        addTXYStages(
            rectifyingStages,
            "Enriching",
            "#ff0000"
        );

        // Stripping section
        addTXYStages(
            strippingStages,
            "Stripping",
            "#0097dd"
        );


        // --------------------------------------------------
        // 4A. DISTILLATE HEAD: SATURATED AND SUBCOOLED POINT
        // --------------------------------------------------

        const xHead = Number(stageData.x_head_saturated);

        const TSaturated =
            Number(stageData.temperature_head_saturated);

        const TSubcooled =
            Number(stageData.temperature_distillate);


        // Only draw this connection if a rectifying stage exists
        if (rectifyingStages.length > 0) {

            const firstRectifyingStage = rectifyingStages[0];

            const stageTemperature =
                Number(firstRectifyingStage?.temperature);

            const TVaporLastStage =
                stageTemperature + 273.15;

            if (
                Number.isFinite(xHead) &&
                Number.isFinite(TSaturated) &&
                Number.isFinite(TSubcooled) &&
                Number.isFinite(TVaporLastStage) &&
                Math.abs(TSaturated - TSubcooled) > 1e-6
            ) {

                // Vertical connection at identical composition
                traces.push({

                    x: [xHead, xHead],
                    y: [TVaporLastStage, TSubcooled],

                    type: "scatter",
                    mode: "lines",

                    name: "Distillate subcooling connection",

                    line: {
                        color: "#ff0000",
                        width: 2
                    },

                    hovertemplate:
                        "Vapor to liquid distillate<br>" +
                        "Composition = %{x:.4f}<br>" +
                        "Temperature = %{y:.2f} K" +
                        "<extra></extra>"

                });


                // Saturated distillate point
                traces.push({

                    x: [xHead],
                    y: [TSaturated],

                    type: "scatter",
                    mode: "markers",

                    name: "Saturated distillate",

                    marker: {
                        color: "#ff0000",
                        size: 9,
                        symbol: "."
                    },

                    hovertemplate:
                        "Saturated distillate<br>" +
                        "Composition = %{x:.4f}<br>" +
                        "Temperature = %{y:.2f} K" +
                        "<extra></extra>"

                });
            }
        }
    }


    // --------------------------------------------------
    // 5. PROCESS POINTS: FEED, BOTTOM AND DISTILLATE
    // --------------------------------------------------

    if (stageData) {

        const qDistillate = Number(
            stageData.q?.[2] ??
            stageData.caloric_distillate
        );

        // Distillate temperature
        let distillateTemperature =
            Number(stageData.temperature_distillate);

        // q_D = 1 -> VLLE temperature
        if (
            isWaterButanol &&
            Math.abs(qDistillate - 1.0) < 1e-8 &&
            hasVLLE
        ) {
            distillateTemperature = Number(Tvlle);
        }

        const processPoints = [

            {
                x: stageData.feed,
                temperature: stageData.temperature_feed,
                label: "Feed"
            },

            {
                x: stageData.bottom,
                temperature: stageData.temperature_bottom,
                label: "Bottom"
            },

            {
                x: stageData.distillate,
                temperature: distillateTemperature,
                label: "Distillate"
            }

        ];

        processPoints.forEach(point => {

            const composition = Number(point.x);
            const pointTemperature = Number(point.temperature);

            if (
                !Number.isFinite(composition) ||
                !Number.isFinite(pointTemperature)
            ) {
                console.warn("Invalid process point:", point);
                return;
            }

            traces.push({

                x: [composition],
                y: [pointTemperature],

                type: "scatter",
                mode: "markers",

                name: point.label,

                marker: {
                    color: "#0205c7",
                    size: 12,
                    symbol: "circle"
                },

                hovertemplate:
                    point.label + "<br>" +
                    "Composition = %{x:.4f}<br>" +
                    "Temperature = %{y:.2f} K" +
                    "<extra></extra>"

            });
        });
    }


    // --------------------------------------------------
    // 6. DISTILLATE TIE LINE: VLLE OR LLE
    // --------------------------------------------------

    if (
        stageData &&
        isWaterButanol
    ) {

        const qDistillate = Number(
            stageData.q?.[2] ??
            stageData.caloric_distillate
        );

        const distillateX = Number(stageData.distillate);
        const distillateT = Number(stageData.temperature_distillate);

        // CASE 1: q_D = 1 -> VLLE
        if (
            Math.abs(qDistillate - 1.0) < 1e-8 &&
            hasVLLE
        ) {

            traces.push({

                x: [x1, x2],
                y: [Tvlle, Tvlle],

                type: "scatter",
                mode: "lines",

                name: "Distillate VLLE tie line",

                line: {
                    color: "#0205c7",
                    width: 2
                },

                hovertemplate:
                    "VLLE tie line<br>" +
                    "Liquid phase composition = %{x:.4f}<br>" +
                    "Temperature = %{y:.2f} K" +
                    "<extra></extra>"

            });
        }

        // CASE 2: q_D > 1 -> LLE
        else if (
            qDistillate > 1 &&
            vleData.lle &&
            Array.isArray(vleData.lle.x) &&
            vleData.lle.x.length === 2
        ) {

            const lleX1 = numericArray(vleData.lle.x[0]);
            const lleX2 = numericArray(vleData.lle.x[1]);
            const lleT = numericArray(vleData.lle.temperature);

            if (
                validArrays(lleX1, lleT) &&
                validArrays(lleX2, lleT) &&
                Number.isFinite(distillateX) &&
                Number.isFinite(distillateT)
            ) {

                // Sort LLE data by temperature
                const lleData = lleT.map((temp, i) => ({

                    T: temp,
                    x1: lleX1[i],
                    x2: lleX2[i]

                })).sort((a, b) => a.T - b.T);


                // Find neighboring points on the LLE curve
                let lower = null;
                let upper = null;

                for (let i = 0; i < lleData.length - 1; i++) {

                    if (
                        distillateT >= lleData[i].T &&
                        distillateT <= lleData[i + 1].T
                    ) {

                        lower = lleData[i];
                        upper = lleData[i + 1];

                        break;
                    }
                }


                // Interpolate along both LLE binodal branches
                if (lower && upper) {

                    const temperatureDifference =
                        upper.T - lower.T;

                    if (Math.abs(temperatureDifference) > 1e-10) {

                        const fraction =
                            (distillateT - lower.T) /
                            temperatureDifference;

                        const xL1 =
                            lower.x1 +
                            fraction * (upper.x1 - lower.x1);

                        const xL2 =
                            lower.x2 +
                            fraction * (upper.x2 - lower.x2);

                        const xMin = Math.min(xL1, xL2);
                        const xMax = Math.max(xL1, xL2);


                        // Check whether distillate is inside
                        // the LLE two-liquid-phase region
                        if (
                            distillateX >= xMin - 1e-8 &&
                            distillateX <= xMax + 1e-8
                        ) {

                            traces.push({

                                x: [xL1, xL2],
                                y: [distillateT, distillateT],

                                type: "scatter",
                                mode: "lines",

                                name: "Distillate LLE tie line",

                                line: {
                                    color: "#0205c7",
                                    width: 2,
                                    dash: "dash"
                                },

                                hovertemplate:
                                    "Distillate LLE tie line<br>" +
                                    "Liquid phase composition = %{x:.4f}<br>" +
                                    "Temperature = %{y:.2f} K" +
                                    "<extra></extra>"

                            });
                        }
                    }
                }
            }
        }
    }


    // --------------------------------------------------
    // 7. THREE HETEROGENEOUS AZEOTROPE POINTS
    // --------------------------------------------------

    if (hasVLLE) {

        traces.push({

            x: [x1, x2],
            y: [Tvlle, Tvlle],

            type: "scatter",
            mode: "lines",

            name: "VLLE tie line",

            line: {
                color: "#16a34a",
                width: 3,
                dash: "dash"
            },

            hovertemplate:
                "VLLE temperature = %{y:.2f} K<br>" +
                "Composition = %{x:.4f}" +
                "<extra>VLLE tie line</extra>"

        });


        traces.push({

            x: [x1, x2, y3],
            y: [Tvlle, Tvlle, Tvlle],

            type: "scatter",
            mode: "markers",

            name: "Heterogeneous azeotrope points",

            text: [
                "Liquid phase 1",
                "Liquid phase 2",
                "Vapor phase"
            ],

            marker: {
                color: "#16a34a",
                size: 13,

                line: {
                    color: "#ffffff",
                    width: 2
                }
            },

            hovertemplate:
                "%{text}<br>" +
                "Composition = %{x:.4f}<br>" +
                "Temperature = %{y:.2f} K" +
                "<extra>Heterogeneous azeotrope</extra>"

        });


        traces.push({

            x: [y3],
            y: [Tvlle],

            type: "scatter",
            mode: "markers",

            name: "Azeotropic point",

            marker: {
                color: "#16a34a",
                size: 12,

                line: {
                    color: "#ffffff",
                    width: 2
                }
            },

            hovertemplate:
                "Vapor composition y = %{x:.4f}<br>" +
                "VLLE temperature = %{y:.2f} K" +
                "<extra>Dew-point VLLE point</extra>"

        });

    } else if (
        azeotrope.exists &&
        Number.isFinite(Number(azeotrope.x)) &&
        Number.isFinite(Number(azeotrope.temperature))
    ) {

        traces.push({

            x: [Number(azeotrope.x)],
            y: [Number(azeotrope.temperature)],

            type: "scatter",
            mode: "markers",

            name: "Azeotropic point",

            marker: {
                color: "#16a34a",
                size: 12,

                line: {
                    color: "#ffffff",
                    width: 2
                }
            }

        });
    }


    // --------------------------------------------------
    // 8. AXIS RANGE
    // --------------------------------------------------

    const allTemperatures = [

        ...numericArray(temperature),

        ...numericArray(vleData.lle?.temperature || []),

        ...(hasVLLE ? [Tvlle] : []),

        ...(stageData
            ? [
                Number(stageData.temperature_distillate),
                Number(stageData.temperature_head_saturated),
                Number(stageData.temperature_feed),
                Number(stageData.temperature_bottom)
            ]
            : [])

    ].filter(Number.isFinite);


    if (allTemperatures.length === 0) {

        renderPlot(
            [],
            plotLayout(xTitle, yTitle),
            "No valid temperature data available."
        );

        return;
    }


    const minTemperature = Math.min(...allTemperatures);
    const maxTemperature = Math.max(...allTemperatures);

    const temperaturePadding = Math.max(
        2,
        (maxTemperature - minTemperature) * 0.05
    );


    const layout = plotLayout(
        xTitle,
        yTitle,
        {
            xaxis: {
                title: { text: xTitle },
                range: [0, 1],
                autorange: false
            },

            yaxis: {
                title: { text: yTitle },

                range: [
                    minTemperature - temperaturePadding,
                    maxTemperature + temperaturePadding
                ],

                autorange: false
            }
        }
    );


    renderPlot(
        traces,
        layout,
        `T-x,y diagram: ${vleData.mixture}, ${vleData.pressure} bar.`
    );
}




// ==================================================
// N-X-T DIAGRAM
// ==================================================


function drawNXTDiagram() {

    if (
        !stageData ||
        !Array.isArray(stageData.stripping_stages_data) ||
        !Array.isArray(stageData.rectifying_stages_data) ||
        stageData.stripping_stages_data.length === 0 ||
        stageData.rectifying_stages_data.length === 0
    ) {

        renderPlot(
            [],
            plotLayout(
                "Liquid mole fraction x / Temperature T",
                "Stage index n"
            ),
            "Please calculate separation stages first."
        );

        return;
    }





    // --------------------------------------------------
    // 1. READ STAGE DATA
    // --------------------------------------------------

    const stripping = stageData.stripping_stages_data;
    const rectifying = stageData.rectifying_stages_data;

    const nS = stripping.length;

    // Stripping: bottom -> feed
    // No additional bottom point
    const strippingN = Array.from(
        { length: nS },
        (_, i) => i
    );

    const strippingX = numericArray(
        stripping.map(s => s.x)
    );

    const strippingT = numericArray(
        stripping.map(s => s.temperature + 273.15)
    );


// Rectifying: feed -> head
// Python stores these stages in reverse order.
const rectifyingOrdered = [...rectifying].reverse();

const rectifyingN = [
    ...Array.from(
        { length: rectifyingOrdered.length },
        (_, i) => nS - 1 + i
    ),
    nS - 1 + rectifyingOrdered.length,
    nS - 1 + rectifyingOrdered.length
];

const rectifyingX = numericArray([
    ...rectifyingOrdered.map(s => s.x),
    stageData.x_head_saturated,
    stageData.distillate
]);

const rectifyingT = numericArray([
    ...rectifyingOrdered.map(s => s.temperature + 273.15),
    stageData.temperature_head_saturated,
    stageData.temperature_distillate
]);


    // Validate all arrays
    if (
        !validArrays(strippingX, strippingT) ||
        !validArrays(rectifyingX, rectifyingT) ||
        strippingN.length !== strippingX.length ||
        rectifyingN.length !== rectifyingX.length
    ) {

        renderPlot(
            [],
            plotLayout(
                "Composition x / Temperature T",
                "Theoretical stage number N"
            ),
            "Stage composition or temperature data are invalid."
        );

        return;
    }


    // --------------------------------------------------
    // 2. TRACES
    // --------------------------------------------------

    const traces = [

        // Stripping composition
        {
            x: strippingX,
            y: strippingN,

            type: "scatter",
            mode: "lines+markers",

            name: "Stripper – liquid composition x",

            line: {
                color: "#ff0000",
                width: 2
            },

            marker: {
                color: "#ff0000",
                size: 9
            },

            hovertemplate:
                "Stage n = %{y}<br>" +
                "Liquid mole fraction x = %{x:.4f}" +
                "<extra>Stripping</extra>"
        },


        // Rectifying composition
        {
            x: rectifyingX,
            y: rectifyingN,

            type: "scatter",
            mode: "lines+markers",

            name: "Enricher – liquid composition x",

            line: {
                color: "#0097dd",
                width: 2,
            },

            marker: {
                color: "#0097dd",
                size: 9,
                symbol: "."
            },

            hovertemplate:
                "Stage n = %{y}<br>" +
                "Liquid mole fraction x = %{x:.4f}" +
                "<extra>Enriching</extra>"
        },


        // Stripping temperature
        {
            x: strippingT,
            y: strippingN,

            xaxis: "x2",

            type: "scatter",
            mode: "lines+markers",

            name: "Stripper – temperature T",

            line: {
                color: "#ff0000",
                width: 2,
                dash: "dot"
            },

            marker: {
                color: "#ff0000",
                size: 9
            },

            hovertemplate:
                "Stage n = %{y}<br>" +
                "Temperature T = %{x:.2f} K" +
                "<extra>Stripping</extra>"
        },


        // Rectifying temperature
        {
            x: rectifyingT,
            y: rectifyingN,

            xaxis: "x2",

            type: "scatter",
            mode: "lines+markers",

            name: "Enricher – temperature T",

            line: {
                color: "#0097dd",
                width: 2,
                dash: "dot"
            },

            marker: {
                color: "#0097dd",
                size: 9,
                symbol: "."
            },

            hovertemplate:
                "Stage n = %{y}<br>" +
                "Temperature T = %{x:.2f} K" +
                "<extra>Enriching</extra>"
        }

    ];
    


    // --------------------------------------------------
    // 3. LAYOUT
    // --------------------------------------------------

    const allN = [...strippingN, ...rectifyingN];
    const allX = [...strippingX, ...rectifyingX];
    const allT = [...strippingT, ...rectifyingT];

    const maxStage = Math.max(...allN);

    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);

    const minT = Math.min(...allT);
    const maxT = Math.max(...allT);

    const xPadding = (maxX - minX) * 0.05 || 0.01;
    const tPadding = (maxT - minT) * 0.05 || 1;


    const layout = plotLayout(
        "Liquid composition x",
        "Stage index n",
        {
            showlegend: true,

            legend: {
                orientation: "h",
                x: 0.5,
                xanchor: "center",
                y: 1.02,
                yanchor: "bottom",
                font: {
                    size: 11
                }
            },

            margin: {
                l: 85,
                r: 45,
                t: 75,
                b: 20
            },

 // Stage number axis: automatic vertical scaling
        yaxis: {
            title: { text: "Stage index n" },
            domain: [0.22,1],
            dtick: 1,
            autorange: true,
            tickformat: ".0f",
            font: { size: 16}
        },

        // Composition axis: always 0 to 1
        xaxis: {
            title: { text: "" },
            side: "bottom",
            anchor: "y",
            range: [0, 1],
            autorange: false
        },

        xaxis2: {
            title: { text: "" },
            overlaying: "x",
            anchor: "free",
            side: "bottom",
            position: 0.14,
            range: [
                minT - tPadding,
                maxT + tPadding
            ],
            autorange: false,
            showgrid: false,
            showline: true,
            linecolor: "#000000",
            linewidth: 1.6,
            zeroline: false
        },

        annotations: [{
            text: "Mole fraction x, Temperature T/K",
            xref: "paper",
            yref: "paper",
            x: 0.5,
            y: 0.02,
            showarrow: false,
            xanchor: "center",
            font: { size: 16}
        }]
    }
    );


    renderPlot(
        traces,
        layout,
        "Composition and temperature profiles along the theoretical stages."
    );

}


// ==================================================
// DIAGRAM RENDERING
// ==================================================




function renderSelectedDiagram() {

    currentDiagramType = diagramInfo[selectedDiagram].key;

    switch (currentDiagramType) {

        case "yx":
            return drawYXDiagram();

        case "txy":
            return drawTXYDiagram();

        case "nxt":
            return drawNXTDiagram();

        case "hxy":
            return drawEnthalpyDiagram(enthalpyData);

        default:
            return Promise.resolve();
    }
}



// ==================================================
// ROTARY DIAGRAM SELECTOR
// ==================================================


async function selectDiagram(index) {

    selectedDiagram =
        (index + diagramInfo.length) % diagramInfo.length;

    updateHxyScaleSwitch();

    const selected = diagramInfo[selectedDiagram];

    const switchButton = $("diagramSwitch");

    const angles = [0, 90, 180, 270];

    switchButton.style.setProperty(
        "--dial-angle",
        `${angles[selectedDiagram]}deg`
    );

    switchButton.setAttribute(
        "aria-valuenow",
        String(selectedDiagram + 1)
    );

    switchButton.setAttribute(
        "aria-valuetext",
        selected.label
    );

    switchButton.setAttribute(
        "aria-label",
        `Diagram selector. Current selection: ${selected.label}.`
    );

    $("diagramPosition").textContent =
        `Position ${selectedDiagram + 1} of ${diagramInfo.length}`;

    $("diagramSelection").textContent =
        selected.label;

    $("diagramTitle").textContent =
        selected.title;

    const subtitleElement = $("diagramSubtitle");

    if (subtitleElement) {
        subtitleElement.textContent = selected.subtitle;
    }

    document.querySelectorAll(".rotary-labels span").forEach(
        (label, i) => {

            label.classList.toggle(
                "active",
                i === selectedDiagram
            );

        }
    );

    // Render selected diagram
    const result = await renderSelectedDiagram();

    // --------------------------------------------------
    // APPLY HXY SCALE WHEN RETURNING TO DIAGRAM 1
    // --------------------------------------------------

    if (selectedDiagram === 0) {

        const graph = $("demoChart");

        if (
            graph &&
            graph.data &&
            graph._fullLayout &&
            typeof Plotly !== "undefined"
        ) {

            const hasValidVleScale =
                isValidAxisRange(hxyVleXRange) &&
                isValidAxisRange(hxyVleYRange);

            if (
                hxyScaleMode === "vle" &&
                hasValidVleScale
            ) {

                await Plotly.relayout(graph, {

                    "xaxis.autorange": false,
                    "yaxis.autorange": false,

                    "xaxis.range": [...hxyVleXRange],
                    "yaxis.range": [...hxyVleYRange]

                });

            } else {

                await Plotly.relayout(graph, {

                    "xaxis.autorange": true,
                    "yaxis.autorange": true

                });

            }
        }
    }

    updateHxyScaleSwitch();

    return result;
}


// --------------------------------------------------
// ROTARY SELECTOR CLICK
// --------------------------------------------------

$("diagramSwitch").addEventListener("click", event => {

    const rect = event.currentTarget.getBoundingClientRect();

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const dx = clickX - centerX;
    const dy = clickY - centerY;

    // Determine the dominant direction
    let index;

    if (Math.abs(dx) > Math.abs(dy)) {

        // Right or left
        index = dx > 0 ? 1 : 3;

    } else {

        // Bottom or top
        index = dy > 0 ? 2 : 0;

    }

    selectDiagram(index);
});
// --------------------------------------------------
// ROTARY SELECTOR KEYBOARD
// --------------------------------------------------

$("diagramSwitch").addEventListener("keydown", event => {

    if (
        event.key === "ArrowRight" ||
        event.key === "ArrowUp"
    ) {

        event.preventDefault();
        selectDiagram(selectedDiagram + 1);

    }

    if (
        event.key === "ArrowLeft" ||
        event.key === "ArrowDown"
    ) {

        event.preventDefault();
        selectDiagram(selectedDiagram - 1);

    }

});


// --------------------------------------------------
// ROTARY LABELS
// --------------------------------------------------

document.querySelectorAll(".rotary-labels span").forEach(
    (label, index) => {

        label.addEventListener("click", () => {
            selectDiagram(index);
        });

    }
);
