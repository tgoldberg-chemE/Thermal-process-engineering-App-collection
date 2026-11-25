
// =========================================================
// 1. GENERAL HELPERS
// =========================================================

const TERNARY_HEIGHT = Math.sqrt(3) / 2;


// Ternary [a,b,c] -> Cartesian
// a = top, b = bottom-left, c = bottom-right

function ternaryToCartesian(p) {

    const [a, b, c] = p;

    return {
        x: c + a / 2,
        y: TERNARY_HEIGHT * a
    };
}


// Validate composition

function isValidComposition(p) {

    return (
        Array.isArray(p) &&
        p.length === 3 &&
        p.every(v => Number.isFinite(Number(v)))
    );
}


// Validate composition with sum = 1.
// Negative components are allowed.

function isFiniteComposition(p) {

    return (
        isValidComposition(p) &&
        Math.abs(
            p.reduce((sum, v) => sum + Number(v), 0) - 1
        ) < 1e-6
    );
}


// Convert a single composition or an array of compositions
// into the diagram component order.

function getOrderedPoints(points, mixture) {

    if (!Array.isArray(points)) return [];

    // A single composition: [a,b,c]
    if (isValidComposition(points)) {
        return [
            reorderComposition(points, mixture)
        ];
    }

    // Multiple compositions: [[a,b,c], [a,b,c], ...]
    return points
        .filter(isValidComposition)
        .map(p => reorderComposition(p, mixture));
}


// =========================================================
// 2. COMPONENT ORDER
// =========================================================

function reorderComposition(p, mixture) {

    if (!isValidComposition(p)) {
        return [NaN, NaN, NaN];
    }

    // Python:
    // [Acetone, Water, Toluene]
    //
    // Diagram:
    // [Water, Toluene, Acetone]

    if (mixture === "acetone-water-toluene") {
        return [
            Number(p[1]),
            Number(p[2]),
            Number(p[0])
        ];
    }

    // Python:
    // [Water, Acetic Acid, Ethyl Butanoate]
    //
    // Diagram:
    // [Ethyl Butanoate, Water, Acetic Acid]

    if (mixture === "acetic-acid-water-ethyl-butanoate") {
        return [
            Number(p[1]),
            Number(p[2]),
            Number(p[0])
        ];
    }

    return p.map(Number);
}


// =========================================================
// 3. COMPONENT LABELS
// =========================================================

function getMixtureLabels() {

    const mixture = document.getElementById("mixture")?.value;

    const labels = {

        "acetone-water-toluene": [
            "Acetone (3)",
            "Water (1)",
            "Toluene (2)"
        ],

        "acetic-acid-water-ethyl-butanoate": [
            "Acetic Acid (3)",
            "Ethyl Butanoate (1)",
            "Water (2)"
        ]

    };

    return labels[mixture] || [
        "Component A",
        "Component B",
        "Component C"
    ];
}

function getSystemTemperature() {
    const temperature = document.getElementById("temperature")?.value;

    if (temperature === undefined || temperature === "") {
        return "Temperature not specified";
    }

    return `T = ${temperature} K`;
}

function addWatermark(layout) {
    return {
        ...layout,
        images: [
            ...(layout.images || []),
            {
                source: `${APP_ROOT}/static/images/watermark.png`,
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

function addCommonLayoutSettings(layout) {

    const temperatureLabel = getSystemTemperature();

    layout.paper_bgcolor = "#ffffff";
    layout.plot_bgcolor = "#ffffff";

    layout.annotations = [
        ...(layout.annotations || []),
        {
            x: 1,
            y: 1.04,
            xref: "paper",
            yref: "paper",
            text: temperatureLabel,
            showarrow: false,
            xanchor: "right",
            yanchor: "bottom",
            font: {
                size: 13,
                color: "#444444"
            }
        }
    ];

    // Platz für Temperaturangabe schaffen
    layout.margin = {
        ...(layout.margin || {}),
        t: Math.max(layout.margin?.t || 0, 65)
    };

    return layout;
}


// =========================================================
// 4. HOVER TEMPLATE
// =========================================================

function createCartesianHoverTemplate(labels, phase) {

    return (
        `<b>${phase}</b><br>` +
        `${labels[0]}: %{customdata[0]:.3f}<br>` +
        `${labels[1]}: %{customdata[1]:.3f}<br>` +
        `${labels[2]}: %{customdata[2]:.3f}` +
        `<extra></extra>`
    );
}


// =========================================================
// 5. CONVERT POINTS TO CARTESIAN DATA
// =========================================================

function cartesianTraceData(points) {

    const xy = points.map(ternaryToCartesian);

    return {
        x: xy.map(p => p.x),
        y: xy.map(p => p.y),
        customdata: points
    };
}


// =========================================================
// 6. DISTRIBUTED TIE LINE INDICES
// =========================================================

function getDistributedTieLineIndices(count, numberToShow = 6) {

    if (count <= 0) return [];

    if (count <= numberToShow) {
        return Array.from(
            { length: count },
            (_, i) => i
        );
    }

    const indices = [];

    for (let i = 0; i < numberToShow; i++) {

        indices.push(
            Math.round(i * (count - 1) / (numberToShow - 1))
        );
    }

    return [...new Set(indices)];
}


// =========================================================
// 7. UNIFIED CARTESIAN TERNARY GRID
// =========================================================

function addCartesianTernaryGrid(traces) {

    const h = TERNARY_HEIGHT;

    // -----------------------------------------------------
    // TRIANGLE FRAME
    // -----------------------------------------------------

    traces.push({

        type: "scatter",
        mode: "lines",
        name: "Ternary frame",

        x: [0, 1, 0.5, 0],
        y: [0, 0, h, 0],

        line: {
            color: "#222222",
            width: 2
        },

        hoverinfo: "skip",
        showlegend: false
    });


    // -----------------------------------------------------
    // GRID LINES
    // -----------------------------------------------------

    for (let i = 1; i < 10; i++) {

        const t = i / 10;

        // Constant a

        traces.push({

            type: "scatter",
            mode: "lines",

            x: [
                t / 2,
                1 - t / 2
            ],

            y: [
                h * t,
                h * t
            ],

            line: {
                color: "#dddddd",
                width: 1
            },

            hoverinfo: "skip",
            showlegend: false
        });


        // Constant b

        traces.push({

            type: "scatter",
            mode: "lines",

            x: [
                (1 - t) / 2,
                1 - t
            ],

            y: [
                h * (1 - t),
                0
            ],

            line: {
                color: "#dddddd",
                width: 1
            },

            hoverinfo: "skip",
            showlegend: false
        });


        // Constant c

        traces.push({

            type: "scatter",
            mode: "lines",

            x: [
                (1 + t) / 2,
                t
            ],

            y: [
                h * (1 - t),
                0
            ],

            line: {
                color: "#dddddd",
                width: 1
            },

            hoverinfo: "skip",
            showlegend: false
        });
    }
}


// =========================================================
// 8. UNIFIED CARTESIAN LAYOUT WITH AXIS LABELS
// =========================================================

function createCartesianTernaryLayout(
    labels,
    stageData = null,
    mixture = null
) {

    const h = TERNARY_HEIGHT;
    const annotations = [];

    let xMin = -0.10;
    let xMax = 1.10;
    let yMin = -0.10;
    let yMax = h + 0.12;


    // Extend axes if an external operating point exists.

    if (
        stageData &&
        isFiniteComposition(stageData.X_Pi)
    ) {

        const Pi = ternaryToCartesian(
            reorderComposition(stageData.X_Pi, mixture)
        );

        xMin = Math.min(xMin, Pi.x - 0.10);
        xMax = Math.max(xMax, Pi.x + 0.10);
        yMin = Math.min(yMin, Pi.y - 0.10);
        yMax = Math.max(yMax, Pi.y + 0.10);
    }


    // -----------------------------------------------------
    // COMPONENT LABELS
    // -----------------------------------------------------

    annotations.push(

        {
            x: 0.5,
            y: h + 0.09,
            text: labels[0],
            showarrow: false,
            xanchor: "center",
            yanchor: "bottom"
        },

        {
            x: -0.07,
            y: -0.04,
            text: labels[1],
            showarrow: false,
            xanchor: "right",
            yanchor: "top"
        },

        {
            x: 1.07,
            y: -0.04,
            text: labels[2],
            showarrow: false,
            xanchor: "left",
            yanchor: "top"
        }
    );


    // -----------------------------------------------------
    // TICK LABELS
    // -----------------------------------------------------

    for (let i = 0; i <= 10; i++) {

        const t = i / 10;
        const value = t.toFixed(1);


        // Left sloping side

        annotations.push({

            x: (1 - t) / 2,
            y: h * (1 - t),

            text: value,

            showarrow: false,

            font: {
                size: 9,
                color: "#666666"
            },

            xanchor: "right",
            yanchor: "middle",
            xshift: -8
        });


        // Right sloping side – reversed

        annotations.push({

            x: (1 + t) / 2,
            y: h * (1 - t),

            text: (1 - t).toFixed(1),

            showarrow: false,

            font: {
                size: 9,
                color: "#666666"
            },

            xanchor: "left",
            yanchor: "middle",
            xshift: 8
        });


        // Bottom horizontal side

        annotations.push({

            x: t,
            y: -0.035,

            text: value,

            showarrow: false,

            font: {
                size: 9,
                color: "#666666"
            },

            xanchor: "center",
            yanchor: "top"
        });
    }


    return {

        xaxis: {

            range: [xMin, xMax],
            visible: false,
            zeroline: false,
            constrain: "domain",
            fixedrange: false
        },

        yaxis: {

            range: [yMin, yMax],
            visible: false,
            zeroline: false,
            scaleanchor: "x",
            scaleratio: 1,
            fixedrange: false
        },

        annotations,

        showlegend: false,

        margin: {
            l: 35,
            r: 35,
            t: 35,
            b: 35
        },

        autosize: true,

        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",

        hovermode: "closest"
    };
}


// =========================================================
// 9. INITIALIZE EMPTY DIAGRAM
// =========================================================

function initializeTernaryDiagram() {

    const chart = document.getElementById("mainChart");

    if (!chart || typeof Plotly === "undefined") {
        console.error("Chart element or Plotly.js not found.");
        return;
    }

    const labels = getMixtureLabels();

    const traces = [];

    addCartesianTernaryGrid(traces);

    Plotly.newPlot(
        chart,
        traces,
        addCommonLayoutSettings(
            createCartesianTernaryLayout(labels)
        ),
        {
            responsive: true,
            displaylogo: false
        }
    );
}


// =========================================================
// 10. UPDATE DIAGRAM LABELS
// =========================================================

function updateTernaryLayout() {

    const chart = document.getElementById("mainChart");

    if (!chart || typeof Plotly === "undefined") {
        return;
    }

    const labels = getMixtureLabels();

    const layout = addCommonLayoutSettings(
        createCartesianTernaryLayout(labels)
    );

    Plotly.relayout(chart, {
        annotations: layout.annotations,
        paper_bgcolor: layout.paper_bgcolor,
        plot_bgcolor: layout.plot_bgcolor,
        margin: layout.margin
    });
}

// =========================================================
// 11. SHARED CARTESIAN TRACE HELPERS
// =========================================================


// ---------------------------------------------------------
// CREATE LINE TRACE
// ---------------------------------------------------------

function createCartesianLine(
    points,
    name,
    color = "#000000",
    width = 2,
    dash = "solid",
    labels = []
) {

    if (!Array.isArray(points)) return null;

    const validPoints = points
        .filter(isValidComposition)
        .map(p => p.map(Number));

    if (validPoints.length < 2) return null;

    const xy = cartesianTraceData(validPoints);

    return {

        type: "scatter",
        mode: "lines",
        name,

        x: xy.x,
        y: xy.y,
        customdata: xy.customdata,

        line: {
            color,
            width,
            dash
        },

        hovertemplate: createCartesianHoverTemplate(
            labels,
            name
        )
    };
}


// ---------------------------------------------------------
// CREATE MARKER TRACE
// ---------------------------------------------------------

function createCartesianMarkers(
    points,
    name,
    color,
    symbol = "circle",
    labels = [],
    size = 10
) {

    if (!Array.isArray(points)) return null;

    const validPoints = points
        .filter(isValidComposition)
        .map(p => p.map(Number));

    if (validPoints.length === 0) return null;

    const xy = cartesianTraceData(validPoints);

    return {

        type: "scatter",
        mode: "markers",
        name,

        x: xy.x,
        y: xy.y,
        customdata: xy.customdata,

        marker: {

            color,
            size,
            symbol,

            line: {
                color: "#ffffff",
                width: 0.5
            }
        },

        hovertemplate: createCartesianHoverTemplate(
            labels,
            name
        )
    };
}


// =========================================================
// 12. CENTRAL ADD LINE FUNCTION
// =========================================================

function addLine(
    traces,
    name,
    points,
    color,
    labels,
    mixture,
    width = 2,
    dash = "solid"
) {

    const orderedPoints = getOrderedPoints(
        points,
        mixture
    );

    const trace = createCartesianLine(
        orderedPoints,
        name,
        color,
        width,
        dash,
        labels
    );

    if (trace) {
        traces.push(trace);
    }
}


// =========================================================
// 13. CENTRAL ADD MARKERS FUNCTION
// =========================================================

function addMarkers(
    traces,
    name,
    points,
    color,
    labels,
    mixture,
    symbol = "circle",
    size = 10
) {

    const orderedPoints = getOrderedPoints(
        points,
        mixture
    );

    const trace = createCartesianMarkers(
        orderedPoints,
        name,
        color,
        symbol,
        labels,
        size
    );

    if (trace) {
        traces.push(trace);
    }
}


// =========================================================
// 14. PLOT LLE RESULTS
// =========================================================

function plotLLE(data) {

    if (
        !data ||
        !Array.isArray(data.X_P1) ||
        !Array.isArray(data.X_P2)
    ) {

        console.error("Invalid LLE data:", data);
        return;
    }

    const mixture = document.getElementById("mixture")?.value;
    const labels = getMixtureLabels();
    const chart = document.getElementById("mainChart");
    chart.classList.remove("kx-chart");

    if (!chart || typeof Plotly === "undefined") {
        console.error("Plotly or mainChart not found.");
        return;
    }

    const traces = [];

    addCartesianTernaryGrid(traces);


    // -----------------------------------------------------
    // BINODAL CURVES
    // -----------------------------------------------------

    const X1 = data.X_P1.filter(isValidComposition);
    const X2 = data.X_P2.filter(isValidComposition);

    addLine(
        traces,
        "Phase 1",
        X1,
        "#d97735",
        labels,
        mixture,
        3,
        "solid"
    );

    addLine(
        traces,
        "Phase 2",
        X2,
        "#d97735",
        labels,
        mixture,
        3,
        "solid"
    );


    // -----------------------------------------------------
    // TIE LINES
    // -----------------------------------------------------

    const count = Math.min(X1.length, X2.length);

    const selectedIndices = getDistributedTieLineIndices(
        count,
        6
    );

selectedIndices.forEach(i => {
    if (i === 0) return;

    addLine(
        traces,
        "Tie line",
        [X1[i], X2[i]],
        "#d97735",
        labels,
        mixture,
        2,
        "dash"
    );
});


    // -----------------------------------------------------
    // PLAIT POINT
    // -----------------------------------------------------

    const plaitPoint = data.X_PP || data.plait_point;

    if (isValidComposition(plaitPoint)) {

        addMarkers(
            traces,
            "Plait Point",
            [plaitPoint],
            "#800000",
            labels,
            mixture,
            "square",
            11
        );
    }


    // -----------------------------------------------------
    // PLOT
    // -----------------------------------------------------

    const layout = createCartesianTernaryLayout(labels);

    Plotly.react(
        chart,
        traces,
        addWatermark(addCommonLayoutSettings(layout)),
        {
            responsive: true,
            displaylogo: false,
                    modeBarButtonsToRemove: [
            "select2d",
            "lasso2d"
        ],
                toImageButtonOptions: {
        format: "png",
        filename: "Ternary_Diagram",
        scale: 4
    }
        }
    );
}


// =========================================================
// 15. PLOT CROSS-CURRENT EXTRACTION
// =========================================================

function plotCrossCurrent(lleData, stageData = null, errorData = null) {

    if (!lleData) {
        console.error("LLE data is missing.");
        return;
    }

    if (!stageData && !errorData) {
        console.error("Extraction data is missing.");
        return;
    }

    const mixture = document.getElementById("mixture")?.value;
    const labels = getMixtureLabels();
    const chart = document.getElementById("mainChart");
    chart.classList.remove("kx-chart");

    if (!chart || typeof Plotly === "undefined") {
        console.error("Plotly or mainChart not found.");
        return;
    }

    const traces = [];

    addCartesianTernaryGrid(traces);


    // -----------------------------------------------------
    // 1. BINODAL
    // -----------------------------------------------------

    addLine(
        traces,
        "Binodal – Phase 1",
        lleData.X_P1,
        "#d97735",
        labels,
        mixture,
        3
    );

    addLine(
        traces,
        "Binodal – Phase 2",
        lleData.X_P2,
        "#d97735",
        labels,
        mixture,
        3
    );


    // -----------------------------------------------------
    // 2. PLAIT POINT
    // -----------------------------------------------------

    const plaitPoint = lleData.X_PP || lleData.plait_point;

    if (isValidComposition(plaitPoint)) {

        addMarkers(
            traces,
            "Plait Point",
            [plaitPoint],
            "#800000",
            labels,
            mixture,
            "square",
            11
        );
    }


    // -----------------------------------------------------
    // 3. FEED AND SOLVENT
    // -----------------------------------------------------

    const xFeed = errorData?.x_feed ?? stageData?.x_feed;
    const ySolvent = errorData?.y_solvent ?? stageData?.y_solvent;

    if (isValidComposition(ySolvent)) {

        addMarkers(
            traces,
            "Solvent",
            [ySolvent],
            "#2563eb",
            labels,
            mixture,
            "circle",
            13
        );
    }

    if (isValidComposition(xFeed)) {

        addMarkers(
            traces,
            "Feed",
            [xFeed],
            "#16a36a",
            labels,
            mixture,
            "circle",
            13
        );
    }

    if (
        isValidComposition(xFeed) &&
        isValidComposition(ySolvent)
    ) {

        addLine(
            traces,
            "Feed – solvent",
            [xFeed, ySolvent],
            errorData ? "#222222" : "#222222",
            labels,
            mixture,
            3
        );
    }

    if(stageData){
    // -----------------------------------------------------
    // 4. EXTRACTION STAGES
    // -----------------------------------------------------

    const X_R = Array.isArray(stageData.X_R)
        ? stageData.X_R
        : [];

    const Y_E = Array.isArray(stageData.Y_E)
        ? stageData.Y_E
        : [];

    const stageCount = Math.min(
        Y_E.length,
        Math.max(0, X_R.length - 1)
    );

    for (let i = 0; i < stageCount; i++) {

        addLine(
            traces,
            `Stage ${i + 1}: equilibrium`,
            [X_R[i + 1], Y_E[i]],
            "#d97735",
            labels,
            mixture,
            2,
            "dash"
        );

        if (isValidComposition(ySolvent)) {

            addLine(
                traces,
                `Stage ${i + 1}: mixing`,
                [X_R[i], ySolvent],
                "#222222",
                labels,
                mixture,
                1.5
            );
        }
    }


    // -----------------------------------------------------
    // 5. MINIMUM SOLVENT RATIO
    // -----------------------------------------------------

    addLine(
        traces,
        "Limiting tie line",
        [stageData.X_MAX, stageData.Y_MAX],
        "#777777",
        labels,
        mixture,
        2,
        "dash"
    );

    if (isValidComposition(stageData.X_M_f1)) {

        addMarkers(
            traces,
            "f = 1: Mixing point",
            [stageData.X_M_f1],
            "#777777",
            labels,
            mixture,
            "x",
            11
        );
    }

    if (isValidComposition(stageData.Y_MAX)) {

        addMarkers(
            traces,
            "f = 1: Extract 1",
            [stageData.Y_MAX],
            "#777777",
            labels,
            mixture,
            "circle",
            10
        );
    }


    // -----------------------------------------------------
    // 6. MIXING POINTS
    // -----------------------------------------------------

    addMarkers(
        traces,
        "Mixing point",
        stageData.X_M,
        "#222222",
        labels,
        mixture,
        "x",
        11
    );


    // -----------------------------------------------------
    // 7. RAFFINATE AND EXTRACT
    // -----------------------------------------------------

    addMarkers(
        traces,
        "Raffinate",
        X_R.slice(1),
        "#16a36a",
        labels,
        mixture,
        "circle",
        10
    );

    addMarkers(
        traces,
        "Extract",
        Y_E,
        "#2563eb",
        labels,
        mixture,
        "circle",
        10
    );
}

    // -----------------------------------------------------
    // 8. PLOT
    // -----------------------------------------------------

    const layout = createCartesianTernaryLayout(labels);

    Plotly.react(
        chart,
        traces,
        addWatermark(addCommonLayoutSettings(layout)),
        {
            responsive: true,
            displaylogo: false,
                    modeBarButtonsToRemove: [
            "select2d",
            "lasso2d"
        ],
        toImageButtonOptions: {
        format: "png",
        filename: "Ternary_Diagram",
        scale: 4
    }
        }
    );
}


// =========================================================
// 16. PLOT COUNTER-CURRENT EXTRACTION
// =========================================================

function plotCounterCurrent(lleData, stageData = null, errorData = null) {

    if (!lleData) {
        console.error("LLE data is missing.");
        return;
    }

    if (!stageData && !errorData) {
        console.error("Extraction data is missing.");
        return;
    }

    const mixture = document.getElementById("mixture")?.value;
    const labels = getMixtureLabels();
    const chart = document.getElementById("mainChart");
    chart.classList.remove("kx-chart");

    if (!chart || typeof Plotly === "undefined") {
        console.error("Plotly or mainChart not found.");
        return;
    }

    const traces = [];

    addCartesianTernaryGrid(traces);


    // -----------------------------------------------------
    // 1. BINODAL CURVES
    // -----------------------------------------------------

    addLine(
        traces,
        "Binodal – Phase 1",
        lleData.X_P1,
        "#d97735",
        labels,
        mixture,
        3
    );

    addLine(
        traces,
        "Binodal – Phase 2",
        lleData.X_P2,
        "#d97735",
        labels,
        mixture,
        3
    );


    // -----------------------------------------------------
    // 2. PLAIT POINT
    // -----------------------------------------------------

    const plaitPoint = lleData.X_PP || lleData.plait_point;

    if (isValidComposition(plaitPoint)) {

        addMarkers(
            traces,
            "Plait Point",
            [plaitPoint],
            "#800000",
            labels,
            mixture,
            "square",
            11
        );
    }

    // -----------------------------------------------------
    // 3. RAFFINATE AND EXTRACT DATA
    // -----------------------------------------------------

    const raffinate = Array.isArray(stageData?.X_R)
        ? stageData.X_R
        : [];

    const extracts = Array.isArray(stageData?.Y_E)
        ? stageData.Y_E
        : [];



    // -----------------------------------------------------
    // 3. FEED AND SOLVENT
    // -----------------------------------------------------

    const xFeed = errorData?.x_feed ?? stageData?.x_feed;
    const ySolvent = errorData?.y_solvent ?? stageData?.y_solvent;

    if (isValidComposition(ySolvent)) {

        addMarkers(
            traces,
            "Solvent",
            [ySolvent],
            "#2563eb",
            labels,
            mixture,
            "circle",
            13
        );
    }

    if (isValidComposition(xFeed)) {

        addMarkers(
            traces,
            "Feed",
            [xFeed],
            "#16a36a",
            labels,
            mixture,
            "circle",
            13
        );
    }

    if (
        isValidComposition(xFeed) &&
        isValidComposition(ySolvent)
    ) {

        addLine(
            traces,
            "Feed – solvent",
            [xFeed, ySolvent],
            errorData ? "#222222" : "#222222",
            labels,
            mixture,
            3
        );
    }

    if(stageData){
    // -----------------------------------------------------
    // 5. LIMITING RAFFINATE
    // -----------------------------------------------------

    const x_RN = stageData.X_RN;

    if (
        isValidComposition(x_RN) &&
        isValidComposition(extracts[0])
    ) {

        addLine(
            traces,
            "Target raffinate – Extract 1",
            [x_RN, extracts[0]],
            "#222222",
            labels,
            mixture,
            3
        );

        addMarkers(
            traces,
            "Target raffinate",
            [x_RN],
            "#16a36a",
            labels,
            mixture,
            "circle",
            12
        );
    }


    // -----------------------------------------------------
    // 6. MIXING POINT
    // -----------------------------------------------------

    if (isValidComposition(stageData.X_M)) {

        addMarkers(
            traces,
            "Mixing point",
            [stageData.X_M],
            "#222222",
            labels,
            mixture,
            "x",
            11
        );
    }


    // -----------------------------------------------------
    // 7. EQUILIBRIUM STAGES
    // -----------------------------------------------------

    const stageCount = Math.min(
        Math.max(0, raffinate.length - 1),
        extracts.length
    );

    for (let i = 0; i < stageCount; i++) {

        addLine(
            traces,
            `Stage ${i + 1}: equilibrium`,
            [
                raffinate[i + 1],
                extracts[i]
            ],
            "#d97735",
            labels,
            mixture,
            2,
            "dash"
        );
    }


    // -----------------------------------------------------
    // 8. OPERATING POINT AND OPERATING LINES
    // -----------------------------------------------------

    if (isFiniteComposition(stageData.X_Pi)) {

        // X_Pi can be outside the triangle.
        // It is deliberately not clipped.

        addMarkers(
            traces,
            "Pole point",
            [stageData.X_Pi],
            "#7c3aed",
            labels,
            mixture,
            "circle",
            13
        );


        // Operating lines to raffinate points

        for (let i = 1; i < raffinate.length; i++) {

            if (!isValidComposition(raffinate[i])) continue;

            addLine(
                traces,
                "Operating line",
                [
                    stageData.X_Pi,
                    raffinate[i]
                ],
                "#7c3aed",
                labels,
                mixture,
                2,
                "solid"
            );
        }


        // Operating lines to extract points

        for (let i = 1; i < extracts.length+1; i++) {

            if (!isValidComposition(extracts[i - 1])) continue;

            addLine(
                traces,
                "Operating line",
                [
                    stageData.X_Pi,
                    extracts[i - 1]
                ],
                "#7c3aed",
                labels,
                mixture,
                2,
                "solid"
            );
        }


        // Operating line to feed

        addLine(
            traces,
            "Operating line",
            [
                stageData.X_Pi,
                stageData.x_feed
            ],
            "#7c3aed",
            labels,
            mixture,
            3,
            "solid"
        );


        // Operating line to first extract

        addLine(
            traces,
            "Operating line",
            [
                stageData.X_Pi,
                extracts[0]
            ],
            "#7c3aed",
            labels,
            mixture,
            3,
            "solid"
        );


        // Operating line to solvent

        addLine(
            traces,
            "Operating line",
            [
                stageData.X_Pi,
                stageData.y_solvent
            ],
            "#7c3aed",
            labels,
            mixture,
            3,
            "solid"
        );


        // Operating line to limiting raffinate

        addLine(
            traces,
            "Operating line",
            [
                stageData.X_Pi,
                stageData.X_RN
            ],
            "#7c3aed",
            labels,
            mixture,
            3,
            "solid"
        );
    }


    // -----------------------------------------------------
    // 9. RAFFINATE AND EXTRACT MARKERS
    // -----------------------------------------------------

    addMarkers(
        traces,
        "Raffinate",
        raffinate.slice(1),
        "#16a36a",
        labels,
        mixture,
        "circle",
        10
    );

    addMarkers(
        traces,
        "Extract",
        extracts,
        "#2563eb",
        labels,
        mixture,
        "circle",
        10
    );


    // -----------------------------------------------------
    // 10. MINIMUM SOLVENT RATIO (f = 1)
    // -----------------------------------------------------

    if (
        stageData.region == 1 &&
        isValidComposition(stageData.Y_MAX) &&
        isValidComposition(stageData.X_MAX)
    ) {

        addLine(
            traces,
            "f = 1: Raffinate 1 – Extract 1",
            [
                stageData.X_MAX,
                stageData.Y_MAX
            ],
            "#777777",
            labels,
            mixture,
            2,
            "dash"
        );

        addLine(
            traces,
            "f = 1: Raffinate 1 – Feed",
            [
                stageData.X_MAX,
                stageData.x_feed
            ],
            "#777777",
            labels,
            mixture,
            2,
            "dot"
        );

        addMarkers(
            traces,
            "f = 1: Raffinate 1",
            [stageData.X_MAX],
            "#777777",
            labels,
            mixture,
            "circle",
            10
        );
    }


    // -----------------------------------------------------
    // 11. LIMITING RAFFINATE – MAXIMUM EXTRACT
    // -----------------------------------------------------

    if (
        isValidComposition(x_RN) &&
        isValidComposition(stageData.Y_MAX)
    ) {

        addLine(
            traces,
            "f = 1: R lim – Extract 1",
            [
                x_RN,
                stageData.Y_MAX
            ],
            "#777777",
            labels,
            mixture,
            2,
            "solid"
        );
    }


    // -----------------------------------------------------
    // 12. MINIMUM SOLVENT RATIO MIXING POINT
    // -----------------------------------------------------

    if (isValidComposition(stageData.X_M_f1)) {

        addMarkers(
            traces,
            "f = 1: Mixing point",
            [stageData.X_M_f1],
            "#777777",
            labels,
            mixture,
            "x",
            11
        );
    }


    // -----------------------------------------------------
    // 13. MAXIMUM EXTRACT POINT
    // -----------------------------------------------------

    if (isValidComposition(stageData.Y_MAX)) {

        addMarkers(
            traces,
            "f = 1: Extract 1",
            [stageData.Y_MAX],
            "#777777",
            labels,
            mixture,
            "circle",
            10
        );
    }


    // -----------------------------------------------------
    // 14. ADDITIONAL MIXING POINTS
    // -----------------------------------------------------

    addMarkers(
        traces,
        "Mixing point",
        stageData.X_M,
        "#222222",
        labels,
        mixture,
        "x",
        11
    );


    // -----------------------------------------------------
    // 15. LAYOUT
    // -----------------------------------------------------
    setCounterCurrentScale("autoscale");
}
const layout = createCartesianTernaryLayout(
    labels,
    stageData || {},
    mixture
);

    Plotly.react(
        chart,
        traces,
        addWatermark(addCommonLayoutSettings(layout)),
        {
            responsive: true,
            displaylogo: false,
                    modeBarButtonsToRemove: [
            "select2d",
            "lasso2d"
        ],
                toImageButtonOptions: {
        format: "png",
        filename: "Ternary_Diagram",
        scale: 4
    }
        }
    );
}

function plotKXDiagram(data) {

    // Component index: 0 = first, 1 = second, 2 = third component
    const componentIndex = 1;
    const labels = getMixtureLabels();
    const mixtureLabel = [labels[1], labels[2], labels[0]].join(" – ");
    

    if (
        !data ||
        !Array.isArray(data.X_P1) ||
        !Array.isArray(data.X_P2)
    ) {
        console.error("Invalid LLE data:", data);
        return;
    }

    const chart = document.getElementById("mainChart");
    chart.classList.add("kx-chart");

    if (!chart || typeof Plotly === "undefined") {
        console.error("Plotly or mainChart not found.");
        return;
    }

    const traces = [];

    // --------------------------------------------------
    // K-x CURVE: X_P2 / X_P1
    // MATLAB: X_P1(3:end, componentIndex+1)
    // --------------------------------------------------

    const kxPoints = [];

    for (
        let i = 2;
        i < Math.min(data.X_P1.length, data.X_P2.length);
        i++
    ) {
        const x = Number(data.X_P2[i]?.[componentIndex]);
        const y = Number(data.X_P1[i]?.[componentIndex]);

        if (
            Number.isFinite(x) &&
            Number.isFinite(y) &&
            x !== 0
        ) {
            kxPoints.push({
                x: x,
                y: y / x
            });
        }
    }

    traces.push({
        x: kxPoints.map(p => p.x),
        y: kxPoints.map(p => p.y),
        type: "scatter",
        mode: "lines",
        name: "K-x curve",
        line: {
            color: "#d97735",
            width: 3
        },
        hovertemplate:
        `x<sub>${componentIndex + 2}</sub>: %{x:.4f}<br>` +
        `K<sub>${componentIndex + 2}</sub>: %{y:.4f}` +
        `<extra></extra>`
    });


    // --------------------------------------------------
    // PLAIT POINT: K = 1
    // --------------------------------------------------

    const plaitPoint = data.X_PP;

    if (Array.isArray(plaitPoint)) {

        const x = Number(plaitPoint[componentIndex]);

        if (Number.isFinite(x)) {
            traces.push({
                x: [x],
                y: [1],
                type: "scatter",
                mode: "markers",
                name: "Plait point",
                marker: {
                    color: "#800000",
                    size: 11,
                    symbol: "square"
                },
                hovertemplate:
                `x<sub>${componentIndex + 2}</sub>: %{x:.4f}<br>` +
                `K<sub>${componentIndex + 2}</sub>: %{y:.4f}` +
                `<extra></extra>`
            });
        }
    }

    // --------------------------------------------------
    // PLOT
    // --------------------------------------------------
    const layout = {
        autosize: true,

        title: {
            text: `<b>${mixtureLabel}</b>`,
            x: 0.5,
            xanchor: "center",
            y: 0.98,
            yanchor: "top",
            font: {
                size: 14
            }
        },

        xaxis: {
            title: {
                text: `x<sub>${componentIndex + 2}</sub>`
            },
            range: [0, 0.5],
            tickformat: ".2f",
            showline: true,
            mirror: true,
            zeroline: false,
            constrain: "domain",
        },

        yaxis: {
            title: {
                text: `K<sub>${componentIndex + 2}</sub> = y<sub>${componentIndex + 2}</sub> / x<sub>${componentIndex + 2}</sub>`
            },
            tickformat: ".1f",
            showline: true,
            mirror: true,
            zeroline: false
        },

        margin: {
            l: 85,
            r: 30,
            t: 85,
            b: 70
        },

        showlegend: false
    };
    const chartWidth = chart.clientWidth;
    const chartHeight = chartWidth;

    chart.style.height = `${chartHeight}px`;


    Plotly.react(
        chart,
        traces,
        addWatermark(addCommonLayoutSettings(layout)),
        {
            responsive: true,
            displaylogo: false,
                    modeBarButtonsToRemove: [
            "select2d",
            "lasso2d"
        ],
                toImageButtonOptions: {
        format: "png",
        filename: "K-x Diagram",
        scale: 4
    }
        }
    );
}

// =========================================================
// 17. CLEAR DIAGRAM
// =========================================================

function clearDiagram() {

    const chart = document.getElementById("mainChart");

    if (!chart || typeof Plotly === "undefined") {
        return;
    }

    initializeTernaryDiagram();
}
