const APP_ROOT = document.querySelector('meta[name="app-root"]')?.content || "";
// ==================================================
// GLOBAL DATA
// ==================================================

const $ = id => document.getElementById(id);

let vleData = null;
let stageData = null;

let resultsSaved = false;
let selectedDiagram = 0;

let stageHistory = [];
let calculationHistory = [];
let currentDiagramType = null;

const chart = $("demoChart");

// ==================================================
// CENTRAL INFORMATION STATE
// ==================================================

const informationState = {
    vle: null,
    stages: null,
    saveReset: null
};

let activeInformationType = null;


/* =====================================================
   GLOBAL STATUS MANAGEMENT
===================================================== */

function setMainStatus(message, status = "success") {

    const statusPill = document.querySelector(".status-pill");
    const statusText = document.getElementById("appStatus");

    if (!statusPill || !statusText) {
        console.error("Status elements not found!");
        return;
    }

    statusPill.classList.remove(
        "status-success",
        "status-info",
        "status-warning",
        "status-error"
    );

    statusPill.classList.add(`status-${status}`);

    statusText.textContent = message;
}

/* =====================================================
   CALCULATION MESSAGE MANAGEMENT
===================================================== */

function setCalculationMessage(id, message, status = "info") {

    const element = document.getElementById(id);

    if (!element) return;

    element.textContent = message;

    element.classList.remove(
        "status-success",
        "status-info",
        "status-warning",
        "status-error"
    );

    element.classList.add(`status-${status}`);
}


/* =====================================================
   CLEAR CALCULATION MESSAGE
===================================================== */

function clearCalculationMessage(id) {

    const element = document.getElementById(id);

    if (!element) return;

    element.textContent = "";

    element.classList.remove(
        "status-success",
        "status-info",
        "status-warning",
        "status-error"
    );
}


// ==================================================
// TRACK UNSAVED CHANGES
// ==================================================

const calculationInputIds = [
    "mixture",
    "pressure",
    "feed",
    "distillate",
    "bottom",
    "reflux",
    "qFeed",
    "qValueInput"
];

calculationInputIds.forEach(id => {
    const element = $(id);

    if (!element) return;

    element.addEventListener("input", () => {
        resultsSaved = false;
    });

    element.addEventListener("change", () => {
        resultsSaved = false;
    });
});

const diagramInfo = [
    {
        key: "yx",
        label: "y – x",
        title: "McCabe-Thiele (y-x) Diagram",
        subtitle: "Equilibrium and operating lines"
    },
    {
        key: "txy",
        label: "T – x,y",
        title: "T – x,y Diagram",
        subtitle: "Temperature-composition diagram"
    },
    {
        key: "nxt",
        label: "n – x,T",
        title: "n – x,T Diagram",
        subtitle: "Separation stages and temperature"
    }
];


// ==================================================
// STATUS MESSAGES
// ==================================================

function setMessage(id, message, status = "info") {

    const element = $(id);

    if (typeof status === "boolean") {
        status = status ? "error" : "info";
    }

    const validStatuses = [
        "success",
        "info",
        "warning",
        "error"
    ];

    const safeStatus = validStatuses.includes(status)
        ? status
        : "info";

    if (!element) return;

    element.textContent = message;

    element.classList.remove(
        "status-success",
        "status-info",
        "status-warning",
        "status-error"
    );

    if (message) {
        element.classList.add(`status-${safeStatus}`);
    }
}



// ==================================================
// CENTRAL INFORMATION OUTPUT
// ==================================================

const defaultInformation = {
    title: "Additional Information",
    paragraphs: [
        "Select one of the question mark buttons to display additional information about the corresponding function."
    ]
};


// --------------------------------------------------
// STORE INFORMATION
// --------------------------------------------------

function setInformation(type, content) {

    if (!Object.prototype.hasOwnProperty.call(informationState, type)) {
        console.warn(`Unknown information type: ${type}`);
        return;
    }

    informationState[type] = content;

    if (activeInformationType === type) {
        renderInformation();
    }
}


// --------------------------------------------------
// CLEAR ONE INFORMATION SECTION
// --------------------------------------------------

function clearInformation(type) {

    if (!Object.prototype.hasOwnProperty.call(informationState, type)) {
        console.warn(`Unknown information type: ${type}`);
        return;
    }

    informationState[type] = null;

    if (activeInformationType === type) {
        renderInformation();
    }
}


// --------------------------------------------------
// CLEAR ALL INFORMATION
// --------------------------------------------------

function clearAllInformation() {

    Object.keys(informationState).forEach(type => {
        informationState[type] = null;
    });

    activeInformationType = null;

    renderInformation();
}


// --------------------------------------------------
// CREATE SAFE HTML ELEMENTS
// --------------------------------------------------

function createInformationElement(tag, text, className = "") {

    const element = document.createElement(tag);

    element.textContent = String(text ?? "");

    if (className) {
        element.className = className;
    }

    return element;
}


// --------------------------------------------------
// RENDER INFORMATION CONTENT
// --------------------------------------------------

function renderInformation() {

    const output = $("infoOutput");

    if (!output) {
        console.warn("Information output element not found.");
        return;
    }

    output.replaceChildren();

    const content =
        informationState[activeInformationType] || defaultInformation;

    // Title
    if (content.title) {

        output.appendChild(
            createInformationElement(
                "h3",
                content.title
            )
        );
    }

    // Paragraphs
    if (Array.isArray(content.paragraphs)) {

        content.paragraphs.forEach(paragraph => {

            output.appendChild(
                createInformationElement(
                    "p",
                    paragraph
                )
            );

        });
    }


    // Warnings
    if (Array.isArray(content.warnings) && content.warnings.length > 0) {

        const warningContainer = document.createElement("div");
        warningContainer.className = "information-warnings";

        content.warnings.forEach(warning => {

            const warningElement = document.createElement("div");
            warningElement.className = "information-warning";

            const heading = createInformationElement(
                "h4",
                warning.title || "Warning"
            );

            warningElement.appendChild(heading);

            if (warning.message) {
                warningElement.appendChild(
                    createInformationElement(
                        "p",
                        warning.message
                    )
                );
            }

            if (warning.recommendation) {
                const recommendation = createInformationElement(
                    "p",
                    warning.recommendation,
                    "warning-recommendation"
                );

                warningElement.appendChild(recommendation);
            }

            warningContainer.appendChild(warningElement);

        });

        output.appendChild(warningContainer);
    }


    // Information list
    if (Array.isArray(content.items) && content.items.length > 0) {

        const list = document.createElement("ul");

        content.items.forEach(item => {

            const listItem = document.createElement("li");

            if (typeof item === "string") {

                listItem.textContent = item;

            } else {

                const label = createInformationElement(
                    "strong",
                    item.label || ""
                );

                listItem.appendChild(label);

                if (item.value !== undefined && item.value !== null) {

                    listItem.appendChild(
                        document.createTextNode(
                            ` ${item.value}`
                        )
                    );
                }
            }

            list.appendChild(listItem);

        });

        output.appendChild(list);
    }

    // Highlighted summary
    if (content.summary) {

        output.appendChild(
            createInformationElement(
                "p",
                content.summary,
                "information-summary"
            )
        );
    }
}


// --------------------------------------------------
// SHOW INFORMATION
// --------------------------------------------------

function showInformation(type) {

    if (!Object.prototype.hasOwnProperty.call(informationState, type)) {
        console.warn(`Unknown information type: ${type}`);
        return;
    }

    activeInformationType = type;

    renderInformation();
}


// --------------------------------------------------
// QUESTION MARK BUTTONS
// --------------------------------------------------

document.querySelectorAll(".help-icon").forEach(button => {

    button.addEventListener("click", () => {

        showInformation(button.dataset.info);

    });

});


// --------------------------------------------------
// INITIAL INFORMATION DISPLAY
// --------------------------------------------------

renderInformation();



// ==================================================
// PRESSURE OPTIONS
// ==================================================
setMainStatus("Ready", "success");

async function updatePressureOptions() {
    const mixture = $("mixture").value;
    const pressureSelect = $("pressure");

    pressureSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Loading pressures...";

    pressureSelect.appendChild(placeholder);

    try {
        const response = await fetch(
            `${APP_ROOT}/available-pressures/${encodeURIComponent(mixture)}`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Could not load pressures."
            );
        }

        pressureSelect.innerHTML = "";

        data.pressures.forEach(pressure => {
            const option = document.createElement("option");

            option.value = pressure;
            option.textContent = Number(pressure).toFixed(3);

            pressureSelect.appendChild(option);
        });

        if (data.pressures.some(p => Number(p) === 1.013)) {
            pressureSelect.value = "1.013";
        }

    } catch (error) {
        pressureSelect.innerHTML = "";
        setMessage("vleMessage", error.message, true);
        setMainStatus("Invalid input", "error");
    }
}



// ==================================================
// MIXTURE SELECTION
// ==================================================

$("mixture").addEventListener("change", async () => {

    // Clear calculation data
    vleData = null;
    stageData = null;

    // Clear calculation information
    clearInformation("vle");
    clearInformation("stages");

    // Reset output fields
    $("totalStages").value = "";
    $("minReflux").value = "";
    $("actualReflux").value = "";
    $("relativeVolatility").value = "";

    $("upperStages").textContent = "–";
    $("lowerStages").textContent = "–";

    // Clear status messages
    setMessage("vleMessage", "");
    setMessage("stageMessage", "");

    // Update diagram
    renderSelectedDiagram();

    // Load available pressures
    await updatePressureOptions();

});



// ==================================================
// VARIABLE PREVIEW
// ==================================================

function updateVariablePreview() {
    const variables = [
        ["varFeed", "feed"],
        ["varDistillate", "distillate"],
        ["varBottom", "bottom"],
        ["varReflux", "reflux"]
    ];

    variables.forEach(([outputId, inputId]) => {
        const output = $(outputId);
        const input = $(inputId);

        if (output && input) {
            output.textContent =
                Number(input.value || 0).toFixed(2);
        }
    });
}

// ==================================================
// qF INPUT / SLIDER SYNCHRONIZATION
// ==================================================

const qFSlider = $("qFeed");
const qFInput = $("qValueInput");

// Check whether both elements exist
if (qFSlider && qFInput) {

    // Slider -> Number input
    qFSlider.addEventListener("input", () => {

        qFInput.value = Number(qFSlider.value).toFixed(2);

    });

    // Number input -> Slider
    qFInput.addEventListener("input", () => {

        if (qFInput.value === "") return;

        const value = Number(qFInput.value);

        if (
            Number.isFinite(value) &&
            value >= Number(qFSlider.min) &&
            value <= Number(qFSlider.max)
        ) {
            qFSlider.value = value;
        }

    });

    // Validate input when leaving the number field
    qFInput.addEventListener("change", () => {

        let value = Number(qFInput.value);

        if (
            qFInput.value === "" ||
            !Number.isFinite(value)
        ) {
            value = 1;
        }

        value = Math.max(
            Number(qFSlider.min),
            Math.min(Number(qFSlider.max), value)
        );

        qFInput.value = value.toFixed(2);
        qFSlider.value = value;

    });

}


// ==================================================
// VARIABLES / RESULTS SWITCH
// ==================================================

function setDisplayView(view) {

    const showResults = view === "results";

    document.querySelectorAll(".segment").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.view === view
        );

    });

    $("variablesView").classList.toggle(
        "hidden",
        showResults
    );

    $("resultsView").classList.toggle(
        "hidden",
        !showResults
    );
}


document.querySelectorAll(".segment").forEach(button => {

    button.addEventListener("click", () => {

        setDisplayView(button.dataset.view);

    });

});



// ==================================================
// RESULTS TABLE
// ==================================================

function renderResultsTable() {

    const tbody = $("resultsTableBody");
    const count = $("resultsCount");

    if (!tbody || !count) return;

    tbody.innerHTML = "";

    count.textContent =
        `${calculationHistory.length} calculation${calculationHistory.length === 1 ? "" : "s"}`;

    if (calculationHistory.length === 0) {

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 13;
        cell.className = "empty-state";
        cell.textContent = "No separation stage calculations yet.";

        row.appendChild(cell);
        tbody.appendChild(row);

        return;
    }

    // Number of decimal places for each column
    const decimalPlaces = [
        null, // Mixture (text)
        3,    // Pressure
        2,    // Feed
        2,    // Distillate
        2,    // Bottom
        2,    // Reflux
        2,    // q
        0,    // Enriching stages
        0,    // Stripping stages
        0,    // Total stages
        3,    // Minimum reflux
        3,    // Actual reflux
        3     // Relative volatility
    ];

    calculationHistory.forEach(result => {

        const row = document.createElement("tr");

        const values = [
            result.mixture,
            result.pressure,
            result.feed,
            result.distillate,
            result.bottom,
            result.reflux,
            result.q,
            result.enrichingStages,
            result.strippingStages,
            result.totalStages,
            result.minimumReflux,
            result.actualReflux,
            result.relativeVolatility
        ];

        values.forEach((value, index) => {

            const cell = document.createElement("td");

            if (
                value === null ||
                value === undefined ||
                value === ""
            ) {
                cell.textContent = "–";

            } else if (typeof value === "number") {

                cell.textContent = Number.isFinite(value)
                    ? decimalPlaces[index] === null
                        ? String(value)
                        : value.toFixed(decimalPlaces[index])
                    : "–";

            } else {
                cell.textContent = value;
            }

            row.appendChild(cell);

        });

        tbody.appendChild(row);

    });

}

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


function plotLayout(xTitle, yTitle, extra = {}) {

    const mixture =
        $("mixture")?.selectedOptions[0]?.textContent || "";

    const pressure = $("pressure")?.value || "";

    // Zentrales Design für alle Diagramme
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
            },
            range: [0, 1]
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

    // Gemeinsames Design auch nach individuellen Layout-Angaben anwenden
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
// PLOTLY RENDERING
// ==================================================

// ==================================================
// PLOTLY RENDERING
// ==================================================


function renderPlot(traces, layout, message, options = {}) {
    if (!chart) return;

    if (typeof Plotly === "undefined") {
        return;
    }

    chart.dataset.fixedCompositionAxes =
        options.fixedCompositionAxes ? "true" : "false";

    Plotly.react(
        chart,
        traces,
        addWatermark(layout),
        plotConfig
    )
    .then(() => {


        // Ursprüngliche Achsenbereiche speichern
        chart._initialAxisRanges = {};

        [
            "xaxis",
            "yaxis",
            "xaxis2",
            "yaxis2"
        ].forEach(axisName => {
            const axis = chart._fullLayout?.[axisName];

            if (
                axis &&
                Array.isArray(axis.range) &&
                axis.range.length === 2
            ) {
                chart._initialAxisRanges[axisName] = [
                    axis.range[0],
                    axis.range[1]
                ];
            }
        });

        attachPlotClickHandler();
        enableDynamicAxisFormatting(chart);

        const tickUpdate = {};

        [
            "xaxis",
            "yaxis",
            "xaxis2",
            "yaxis2"
        ].forEach(axisName => {
            const axis = chart._fullLayout?.[axisName];

            if (!axis || !axis.range) return;

            if (
                currentDiagramType === "nxt" &&
                axisName === "yaxis"
            ) {
                tickUpdate["yaxis.tickmode"] = "linear";
                tickUpdate["yaxis.tick0"] = 0;
                tickUpdate["yaxis.dtick"] = 1;
                tickUpdate["yaxis.tickformat"] = "d";
            } else {
                tickUpdate[`${axisName}.tickformat`] =
                    getDynamicTickFormat(axis.range);
            }
        });

        if (Object.keys(tickUpdate).length > 0) {
            Plotly.relayout(chart, tickUpdate);
        }
    })
    .catch(error => {
        console.error("Plotly rendering error:", error);

    });
}


// ==================================================
// PLOTLY DATA POINT SELECTION
// ==================================================

function attachPlotClickHandler() {

    if (!chart) return;

    if (chart.dataset.clickHandlerAttached === "true") {
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

        // Vorhandene Annotationen beibehalten
        const annotations = [
            ...(chart.layout.annotations || []),
            annotation
        ];

        // Neuen Punkt hinzufügen
        Plotly.addTraces(chart, markerTrace).then(() => {

            Plotly.relayout(chart, {
                annotations: annotations
            });

        });

    });

    chart.dataset.clickHandlerAttached = "true";
}



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

function getDynamicTickFormat(range) {
    if (!range || range.length !== 2) {
        return ".2f";
    }

    const span = Math.abs(range[1] - range[0]);

    if (span >= 0.5) return ".1f";
    if (span >= 0.1) return ".2f";
    if (span >= 0.01) return ".3f";
    if (span >= 0.001) return ".4f";

    return ".5f";
}

// ==================================================
// DYNAMIC AXIS FORMATTING AND AUTOSCALE
// ==================================================

// ==================================================
// DYNAMIC AXIS FORMATTING AND ZOOM LIMITS
// ==================================================

function enableDynamicAxisFormatting(chart) {
    if (!chart) return;

    if (chart.dataset.dynamicAxisHandlerAttached === "true") {
        return;
    }

    chart.on("plotly_relayout", function(eventData) {

        // Verhindert wiederholte Relayout-Aufrufe
        if (chart.dataset.zoomLimitUpdating === "true") {
            return;
        }

        const update = {};

        const axes = [
            "xaxis",
            "yaxis",
            "xaxis2",
            "yaxis2"
        ];

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

            // Dynamische Zahlenformatierung beibehalten
            if (
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

            // Ursprünglichen Autoscale-Bereich dieser Achse holen
            const initialRange =
                chart._initialAxisRanges?.[axisName];

            if (!initialRange || initialRange.length !== 2) {
                return;
            }

            const valuesAreNumeric = [
                ...initialRange,
                ...currentRange
            ].every(value => Number.isFinite(Number(value)));

            if (!valuesAreNumeric) return;

            const minBound = Math.min(
                Number(initialRange[0]),
                Number(initialRange[1])
            );

            const maxBound = Math.max(
                Number(initialRange[0]),
                Number(initialRange[1])
            );

            // Gewünschten sichtbaren Bereich begrenzen
            let newFirst = Math.max(
                minBound,
                Math.min(maxBound, Number(currentRange[0]))
            );

            let newSecond = Math.max(
                minBound,
                Math.min(maxBound, Number(currentRange[1]))
            );

            // Reihenfolge der Achse beibehalten
            const isReversed =
                Number(initialRange[0]) > Number(initialRange[1]);

            if (isReversed) {
                [newFirst, newSecond] = [newSecond, newFirst];
            }

            // Falls der sichtbare Bereich zusammenfällt:
            // auf den ursprünglichen Bereich zurücksetzen
            if (Math.abs(newSecond - newFirst) < 1e-12) {
                newFirst = initialRange[0];
                newSecond = initialRange[1];
            }

            // Nur aktualisieren, wenn die Grenzen überschritten wurden
            const tolerance = 1e-10;

            if (
                Math.abs(newFirst - Number(currentRange[0])) > tolerance ||
                Math.abs(newSecond - Number(currentRange[1])) > tolerance
            ) {
                update[`${axisName}.range`] = [
                    newFirst,
                    newSecond
                ];

                update[`${axisName}.autorange`] = false;
            }
        });

        // Bei einem expliziten Autoscale-Reset
        // die ursprünglichen Bereiche wiederherstellen
        const autoscaleTriggered = Object.keys(eventData).some(key =>
            key.endsWith(".autorange") &&
            eventData[key] === true
        );

        if (autoscaleTriggered) {

            axes.forEach(axisName => {

                const initialRange =
                    chart._initialAxisRanges?.[axisName];

                if (initialRange) {
                    update[`${axisName}.range`] = [
                        initialRange[0],
                        initialRange[1]
                    ];

                    update[`${axisName}.autorange`] = false;
                }
            });
        }

        if (Object.keys(update).length > 0) {

            chart.dataset.zoomLimitUpdating = "true";

            Plotly.relayout(chart, update)
                .finally(() => {
                    chart.dataset.zoomLimitUpdating = "false";
                });
        }
    });

    chart.dataset.dynamicAxisHandlerAttached = "true";
}

// ==================================================
// Y-X DIAGRAM
// ==================================================



function drawYXDiagram() {
    currentDiagramType = "yx";
    const xTitle = "Liquid mole fraction x";
    const yTitle = "Vapor mole fraction y";

    if (!vleData) {
        renderPlot([], plotLayout(xTitle, yTitle),
            "Please calculate VLE first.");
        return;
    }

    const x = numericArray(vleData.x);
    const y = numericArray(vleData.y);

    if (!validArrays(x, y)) {
        renderPlot([], plotLayout(xTitle, yTitle),
            "Invalid or incomplete VLE data.");
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
                    width: 1.5,
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
                line: { color, width: 2, dash: "dot" }
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
                line: { color, width: 2, dash: "dot" }
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
                line: { color, width: 2.5 }
            });
        }

        const qline = result.q_line || {};

        if (qline.vertical) {
            traces.push({
                x: [qline.x, qline.x],
                y: [qline.y_start ?? 0, qline.y_end ?? 1],
                type: "scatter",
                mode: "lines",
                name: `q-line – ${label}`,
                line: { color, dash: "dash" }
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
                line: { color, dash: "dash" }
            });
        }
    });

    // Three heterogeneous azeotrope points
    if (
        hasVLLE &&
        [x1, x2, y3].every(Number.isFinite) &&
        [x1, x2, y3].every(value => value >= 0 && value <= 1)
    ) {
        // Horizontal VLLE tie line between the two liquid phases
        traces.push({
            x: [x1, x2],
            y: [y3, y3],
            type: "scatter",
            mode: "lines",
            name: "VLLE",
            line: {
                color: "#16a34a",
                width: 3,
                dash: "dash"
            },
            hovertemplate:
                "VLLE<br>" +
                "x = %{x:.4f}<br>" +
                "y = %{y:.4f}"
        });

        // Mark both liquid points and the vapor point
        traces.push({
            x: [x1, x2, y3],
            y: [y3, y3, y3],
            type: "scatter",
            mode: "markers",
            marker: {
                size: 13,
                color: "#16a34a",
                line: {
                    color: "#ffffff",
                    width: 2
                }
            },
            hovertemplate:
              
                "Liquid mole fraction = %{x:.4f}<br>" +
                "Vapor mole fraction = %{y:.4f}"+
               "<extra>VLLE</extra>"
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
                color: "#16a34a",
                line: { color: "#ffffff", width: 2 }
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
        `Calculated VLE curve: ${vleData.mixture}, ${vleData.pressure} bar.`,
        {
            fixedCompositionAxes: true
        }
    );
}




// ==================================================
// T-X-Y DIAGRAM
// ==================================================


function drawTXYDiagram() {
    currentDiagramType = "txy";
    const xTitle = "Mole fraction x, y";
    const yTitle = "Temperature T / K";

    if (!vleData) {
        renderPlot([], plotLayout(xTitle, yTitle),
            "Please calculate VLE first.");
        return;
    }

    const x = numericArray(vleData.x);
    const y = numericArray(vleData.y);
    const temperature = numericArray(vleData.temperature);

    if (!validArrays(x, y, temperature)) {
        renderPlot([], plotLayout(xTitle, yTitle),
            "Temperature-composition data is incomplete or invalid.");
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

        // Left branch of the bubble-point curve
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
                "Liquid mole fraction x = %{x:.4f}<br>" +
                "Temperature = %{y:.2f} K" +
                "<extra>Bubble point</extra>"
        });

        // Right branch of the bubble-point curve
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
                "Liquid mole fraction x = %{x:.4f}<br>" +
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
            marker: { size: 5 },
            hovertemplate:
                "Liquid mole fraction x = %{x:.4f}<br>" +
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

        // Keep dew-curve data outside the VLLE liquid interval.
        // The VLLE vapor point is added explicitly below.
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
            marker: { size: 5 },
            hovertemplate:
                "Vapor mole fraction y = %{x:.4f}<br>" +
                "Temperature = %{y:.2f} K" +
                "<extra>Dew point</extra>"
        });
    }

        // --------------------------------------------------
    // 3. LIQUID-LIQUID EQUILIBRIUM (LLE)
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

            // First liquid phase
            traces.push({
                x: liquidPhase1,
                y: lleTemperature,
                type: "scatter",
                mode: "lines",
                name: "LLE – Liquid phase 1",
                line: {
                    color: "#16a36a",
                    width: 2.5
                },
                hovertemplate:
                    "Liquid phase 1: x = %{x:.4f}<br>" +
                    "Temperature = %{y:.2f} K" +
                    "<extra>LLE</extra>"
            });

            // Second liquid phase
            traces.push({
                x: liquidPhase2,
                y: lleTemperature,
                type: "scatter",
                mode: "lines",
                name: "LLE – Liquid phase 2",
                line: {
                    color: "#16a36a",
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
    // 3. STAGE CONSTRUCTION
    // --------------------------------------------------

    if (
        stageData &&
        Array.isArray(stageData.equilibrium_stage_x) &&
        Array.isArray(stageData.equilibrium_stage_y) &&
        Array.isArray(stageData.equilibrium_stage_temperature)
    ) {
        const stageX = numericArray(
            stageData.equilibrium_stage_x
        );
        const stageY = numericArray(
            stageData.equilibrium_stage_y
        );
        const stageT = numericArray(
            stageData.equilibrium_stage_temperature
        );

        if (
            stageX.length > 0 &&
            validArrays(stageX, stageY, stageT)
        ) {
            const tieX = [];
            const tieT = [];

            const liquidX = [];
            const liquidT = [];

            const vaporX = [];
            const vaporT = [];

            const operatingX = [];
            const operatingT = [];

            for (let i = 0; i < stageX.length; i++) {
                const liquid = stageX[i];
                const vapor = stageY[i];
                const temp = stageT[i];

                tieX.push(liquid, vapor, null);
                tieT.push(temp, temp, null);

                liquidX.push(liquid);
                liquidT.push(temp);

                vaporX.push(vapor);
                vaporT.push(temp);

                if (i < stageX.length - 1) {
                    operatingX.push(
                        vapor,
                        stageX[i + 1],
                        null
                    );

                    operatingT.push(
                        temp,
                        stageT[i + 1],
                        null
                    );
                }
            }

            traces.push({
                x: tieX,
                y: tieT,
                type: "scatter",
                mode: "lines",
                name: "Equilibrium tie lines",
                connectgaps: false,
                line: {
                    color: "#f91693",
                    width: 2
                },
                hoverinfo: "skip"
            });

            traces.push({
                x: operatingX,
                y: operatingT,
                type: "scatter",
                mode: "lines",
                name: "Stage connections",
                connectgaps: false,
                line: {
                    color: "#16a36a",
                    width: 2
                },
                hoverinfo: "skip"
            });

            traces.push({
                x: liquidX,
                y: liquidT,
                type: "scatter",
                mode: "markers",
                name: "Liquid stage points",
                marker: {
                    color: "#2878b8",
                    size: 9,
                    symbol: "circle"
                }
            });

            traces.push({
                x: vaporX,
                y: vaporT,
                type: "scatter",
                mode: "markers",
                name: "Vapor stage points",
                marker: {
                    color: "#d97735",
                    size: 9,
                    symbol: "diamond"
                }
            });
        }
    }

    // --------------------------------------------------
    // 4. THREE HETEROGENEOUS AZEOTROPE POINTS
    // --------------------------------------------------

    if (hasVLLE) {

        // Horizontal three-phase equilibrium line
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
        });

        // Two liquid points and one vapor point
        traces.push({
            x: [x1, x2, y3],
            y: [Tvlle, Tvlle, Tvlle],
            type: "scatter",
            mode: "markers",
            marker: {
                color: "#16a34a",
                size: 13,
                line: {
                    color: "#ffffff",
                    width: 2
                }
            },
            hovertemplate:
                "Mole fraction = %{x:.4f}<br>" +
                "VLLE Temperature = %{y:.2f} K" +
                "<extra>Heterogeneous azeotrope</extra>"
        });

        // The vapor-phase point is explicitly placed on the dew curve.
        traces.push({
            x: [y3],
            y: [Tvlle],
            type: "scatter",
            mode: "markers",
            name: "Azeotrope",
            marker: {
                color: "#16a34a",
                size: 12,
                line: {
                    color: "#ffffff",
                    width: 2
                }
            },
            hovertemplate:
                "Vapor mole fraction y = %{x:.4f}<br>" +
                "VLLE temperature = %{y:.2f} K"
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
            name: "Azeotrope",
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
    // 5. AXIS RANGE
    // --------------------------------------------------

    const allTemperatures = [
        ...numericArray(temperature),
        ...numericArray(vleData.lle?.temperature || []),
        ...(hasVLLE ? [Tvlle] : [])
    ].filter(Number.isFinite);

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
                range: [0, 1]
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
    currentDiagramType = "nxt";
    if (
        !stageData ||
        !Array.isArray(stageData.equilibrium_stage_x) ||
        stageData.equilibrium_stage_x.length === 0
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

    const xs = numericArray(
        stageData.equilibrium_stage_x
    );

    const temps = numericArray(
        stageData.equilibrium_stage_temperature
    );

    if (!validArrays(xs, temps)) {

        renderPlot(
            [],
            plotLayout(
                "Liquid mole fraction x / Temperature T",
                "Stage index n"
            ),
            "Stage composition or temperature data are invalid."
        );

        return;
    }

    // Stage number
    const n = xs.map((_, i) => i);

    // --------------------------------------------------
    // 2. COMPOSITION TRACE
    // --------------------------------------------------

    const traces = [

        {
            x: xs,
            y: n,

            type: "scatter",
            mode: "lines+markers",

            name: "Liquid composition x",
            showlegend: true,
            line: {
                color: "#2878b8",
                width: 3
            },

            marker: {
                color: "#2878b8",
                size: 8
            },

            hovertemplate:
                "Stage index n = %{y}<br>" +
                "Liquid mole fraction x = %{x:.4f}" +
                "<extra>Composition</extra>"
        },

        // --------------------------------------------------
        // 3. TEMPERATURE TRACE
        // --------------------------------------------------

        {
            x: temps,
            y: n,

            xaxis: "x2",

            type: "scatter",
            mode: "lines+markers",

            name: "Temperature T",
            showlegend: true,
            line: {
                color: "#d97735",
                width: 3
            },

            marker: {
                color: "#d97735",
                size: 8
            },

            hovertemplate:
                "Stage index n = %{y}<br>" +
                "Temperature T = %{x:.2f} K" +
                "<extra>Temperature</extra>"
        }
    ];


// --------------------------------------------------
// 4. LAYOUT
// --------------------------------------------------

const maxStage = Math.max(...n);

const minX = Math.min(...xs);
const maxX = Math.max(...xs);

const minT = Math.min(...temps);
const maxT = Math.max(...temps);

const xPadding = (maxX - minX) * 0.05 || 0.01;
const tPadding = (maxT - minT) * 0.05 || 1;

const layout = plotLayout(
    "Liquid mole fraction, x",
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
            tickformat: ".0f"
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
            font: {
                size: 17,
                color: "#000000"
            }
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
// CLEAR DIAGRAM
// ==================================================

function clearDiagram() {
    if (!chart) return;

    if (typeof Plotly !== "undefined") {
        Plotly.purge(chart);
    }

    delete chart.dataset.clickHandlerAttached;
    delete chart.dataset.dynamicAxisHandlerAttached;
    delete chart.dataset.fixedCompositionAxes;

}


// ==================================================
// DIAGRAM RENDERING
// ==================================================

function renderSelectedDiagram() {

    const diagramKey = diagramInfo[selectedDiagram].key;

    switch (diagramKey) {

        case "yx":
            drawYXDiagram();
            break;

        case "txy":
            drawTXYDiagram();
            break;

        case "nxt":
            drawNXTDiagram();
            break;
    }
}


// ==================================================
// ROTARY DIAGRAM SELECTOR
// ==================================================

function selectDiagram(index) {

    selectedDiagram =
        (index + diagramInfo.length) % diagramInfo.length;

    const selected = diagramInfo[selectedDiagram];

    const switchButton = $("diagramSwitch");

    const angles = [0, 120, 240];

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
        `Position ${selectedDiagram + 1} of 3`;

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

    renderSelectedDiagram();
}


$("diagramSwitch").addEventListener("click", (event) => {

    const rect = event.currentTarget.getBoundingClientRect();
    const clickY = event.clientY - rect.top;
    const position = clickY / rect.height;

    if (position < 1 / 3) {
        selectDiagram(0);
    }
    else if (position < 2 / 3) {
        selectDiagram(1);
    }
    else {
        selectDiagram(2);
    }
});


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


document.querySelectorAll(".rotary-labels span").forEach(
    (label, index) => {

        label.addEventListener("click", () => {
            selectDiagram(index);
        });
    }
);



// ==================================================
// CALCULATE VLE
// ==================================================

$("calculateVLE").addEventListener("click", async () => {

    const pressureValue = $("pressure").value;
    const pressure = Number(pressureValue);
    const mixture = $("mixture").value;

    if (
        !pressureValue ||
        !Number.isFinite(pressure) ||
        pressure <= 0
    ) {

        setMessage(
            "vleMessage",
            "Please select a valid pressure.",
            true
        );
        setMainStatus("Invalid pressure", "error");
        return;
    }

    // Clear previous calculation information
    clearInformation("vle");
    clearInformation("stages");

    setMessage(
        "vleMessage",
        "Calculating VLE...",
        "info"
    );

    setMainStatus("Calculating VLE...", "info");

    try {

        const response = await fetch(`${APP_ROOT}/calculate-vle`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                mixture: mixture,
                pressure: pressure
            })

        });

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "VLE calculation failed."
            );
        }

        // Store new VLE data
        vleData = data;

        // Reset previous stage calculation
        stageData = null;
        stageHistory = [];

        resultsSaved = false;

        // Reset result fields
        $("totalStages").value = "";
        $("minReflux").value = "";
        $("actualReflux").value = "";
        $("relativeVolatility").value = "";

        $("upperStages").textContent = "–";
        $("lowerStages").textContent = "–";

        // Update diagram
        // Always show the Y-X diagram after VLE calculation.
        selectDiagram(0);

        // Short status message
        const vleHasWarnings =
            Array.isArray(data.warnings) &&
            data.warnings.length > 0;

        const vleStatus = vleHasWarnings ? "warning" : "success";

        setMessage(
            "vleMessage",
            data.warning || "VLE calculated successfully!",
            vleStatus
        );

        setMainStatus(
            vleHasWarnings
                ? "VLE completed with warnings"
                : "VLE calculated successfully",
            vleStatus
        );

        // Store detailed VLE information
        setInformation("vle", {

            title: "VLE Calculation",

            paragraphs: [
                data.more_message ||
                "VLE calculation completed successfully."
            ]

        });

        console.log("VLE data:", vleData);

    } catch (error) {

        vleData = null;
        stageData = null;

        clearInformation("vle");
        clearInformation("stages");

        setMessage(
            "vleMessage",
            "Error: " + error.message,
            true
        );
        setMainStatus("VLE calculation failed", "error");

        renderSelectedDiagram();

        console.error("VLE error:", error);

    }

});




// ==================================================
// CALCULATE SEPARATION STAGES
// ==================================================

$("calculateStages").addEventListener("click", async () => {

    const z = Number($("feed").value);
    const xd = Number($("distillate").value);
    const xb = Number($("bottom").value);
    const reflux = Number($("reflux").value);
    const q = Number($("qFeed").value);

    // Check VLE data
    if (!vleData) {

        setMessage(
            "stageMessage",
            "Please calculate VLE first.",
            true
        );
        setMainStatus("Invalid input", "error");
        return;
    }

    // Check numeric inputs
    if (![z, xd, xb, reflux, q].every(Number.isFinite)) {

        setMessage(
            "stageMessage",
            "Please enter valid numeric inputs.",
            true
        );
        setMainStatus("Invalid input", "error");
        return;
    }

    // Check composition limits
    if (!(0 < xb && xb < z && z < xd && xd < 1)) {

        setMessage(
            "stageMessage",
            "Expected: 0 < xB < zF < xD < 1.",
            true
        );
        setMainStatus("Invalid input", "error");
        return;
    }

    // Check reflux and q
    if (reflux < 1 || q < -1 || q > 3) {

        setMessage(
            "stageMessage",
            "The reflux factor must be at least 1 and q must be between -1 and 3.",
            true
        );
        setMainStatus("Invalid input", "error");
        return;
    }

    // Clear previous stage information
    stageData = null;
    clearInformation("stages");

    setMessage(
        "stageMessage",
        "Calculating separation stages..."
    );
    setMainStatus("Calculating separation stages...", "info");

    try {

        const response = await fetch(`${APP_ROOT}/calculate-stages`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                vle_data: vleData,
                feed: z,
                distillate: xd,
                bottom: xb,
                reflux: reflux,
                q: q

            })

        });

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.error || "Stage calculation failed."
            );
        }

        // Store calculation results
        stageData = data;

        resultsSaved = false;

        // Add calculation to history
        calculationHistory.push({

            mixture: $("mixture").selectedOptions[0].textContent,
            pressure: Number($("pressure").value),

            feed: z,
            distillate: xd,
            bottom: xb,

            reflux: reflux,
            q: q,

            enrichingStages: data.rectifying_stages,
            strippingStages: data.stripping_stages,
            totalStages: data.total_stages,

            minimumReflux: data.minimum_reflux,
            actualReflux: data.actual_reflux,
            relativeVolatility: data.relative_volatility

        });

        // Update results table
        renderResultsTable();

        // Switch to results view
        setDisplayView("results");

        // Add stage construction to history
        stageHistory.push(data);

        // Update output fields
        $("totalStages").value =
            data.total_stages == null
                ? "∞"
                : data.total_stages;

        $("minReflux").value =
            Number(data.minimum_reflux).toFixed(4);

        $("actualReflux").value =
            Number(data.actual_reflux).toFixed(4);

        $("relativeVolatility").value =
            Number(data.relative_volatility).toFixed(4);

        $("upperStages").textContent =
            data.rectifying_stages == null
                ? "–"
                : data.rectifying_stages;

        $("lowerStages").textContent =
            data.stripping_stages == null
                ? "–"
                : data.stripping_stages;

        // Store detailed stage information centrally

        setInformation("stages", {

            title: "Stage Construction",

            paragraphs: [
                data.more_message ||
                "The theoretical stage calculation has been completed."
            ],

            warnings: data.warnings || [],

            items: [

                {
                    label: "Stripping section:",
                    value: `${data.stripping_stages ?? "–"} stages`
                },

                {
                    label: "Enriching section:",
                    value: `${data.rectifying_stages ?? "–"} stages`
                },

                {
                    label: "Total number of stages:",
                    value: data.total_stages ?? "–"
                }

            ],

            summary: data.total_stages == null
                ? "No finite total number of theoretical stages is available."
                : `The column requires ${data.total_stages} theoretical stages.`

        });


        // Short status message
        const stageHasWarnings =
            (Array.isArray(data.warnings) && data.warnings.length > 0) ||
            data.warning === "Minimum reflux condition." ||
            data.warning === "Physically infeasible minimum reflux ratio." ||
            data.warning === "Physically infeasible operating conditions.";

        setMessage(
            "stageMessage",
            data.warning ||
                (stageHasWarnings
                    ? "Calculation completed with warnings. Check the additional information."
                    : "Separation stages calculated successfully!"),
            stageHasWarnings ? "warning" : "success"
        );

        setMainStatus(
            stageHasWarnings
                ? "Stage calculation completed with warnings"
                : "Stage calculation successful",
            stageHasWarnings ? "warning" : "success"
        );

        // Update diagram
        renderSelectedDiagram();

    } catch (error) {

        stageData = null;

        clearInformation("stages");

        setMessage(
            "stageMessage",
            "Error: " + error.message,
            true
        );
        setMainStatus("Stage calculation failed", "error");
        renderSelectedDiagram();

        console.error("Stage calculation error:", error);

    }

});




// ==================================================
// SAVE / EXPORT RESULTS
// ==================================================

async function saveResults() {

    if (!vleData || !stageData) {
        throw new Error(
            "Both VLE and Stage Construction results are required for export."
        );
    }

    const response = await fetch(`${APP_ROOT}/export-results`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            vle_data: vleData,
            stage_data: stageData,
            calculation_history: calculationHistory
        })

    });

    if (!response.ok) {

        let errorMessage = "Excel export failed.";

        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch (_) {
            // Keep default error message
        }

        throw new Error(errorMessage);
    }

    const blob = await response.blob();

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "Rectification_Results.xlsx";

    document.body.appendChild(link);
    link.click();

    link.remove();

    setTimeout(() => {
        window.URL.revokeObjectURL(url);
    }, 1000);

    // Mark results as saved after successful export
    resultsSaved = true;
}


// ==================================================
// SAVE BUTTON
// ==================================================

$("saveButton").addEventListener("click", async () => {

    if (!vleData) {
        setMessage(
            "generalMessage",
            "Please calculate VLE first.",
            true
        );
        return;
    }

    if (!stageData) {
        setMessage(
            "generalMessage",
            "Please calculate Stage Construction first.",
            true
        );
        return;
    }

    setMessage(
        "generalMessage",
        "Preparing Excel file..."
    );

    try {

        await saveResults();

        setMessage(
            "generalMessage",
            "Excel file successfully saved!",
            "success"
        );

    } catch (error) {

        console.error("Save error:", error);

        setMessage(
            "generalMessage",
            "Save failed: " + error.message,
            true
        );

    }

});



// ==================================================
// RESET
// ==================================================

async function performReset() {

    try {

        // 1. Restore default input values

        $("mixture").value = "ethanol-water";

        $("feed").value = "0.30";
        $("distillate").value = "0.75";
        $("bottom").value = "0.05";
        $("reflux").value = "1.00";

        $("qFeed").value = "1.00";
        $("qValueInput").value = "1.00";


        // 2. Reset calculated output fields

        $("totalStages").value = "0";
        $("minReflux").value = "0";
        $("actualReflux").value = "0";
        $("relativeVolatility").value = "0";


        // 3. Reset stage indicators

        $("upperStages").textContent = "–";
        $("lowerStages").textContent = "–";


        // 4. Clear calculation data

        vleData = null;
        stageData = null;

        stageHistory = [];
        calculationHistory = [];

        resultsSaved = false;


        // 5. Clear all information centrally

        clearAllInformation();


        // 6. Clear status messages

        setMessage("vleMessage", "");
        setMessage("stageMessage", "");
        setMessage("generalMessage", "");


        // 7. Update results table and view

        renderResultsTable();

        setDisplayView("variables");


        // 8. Clear diagram

        clearDiagram();


        // 9. Reset diagram selector

        selectedDiagram = 0;

        const selected = diagramInfo[0];

        $("diagramPosition").textContent = "Position 1 of 3";
        $("diagramSelection").textContent = selected.label;
        $("diagramTitle").textContent = selected.title;

        const subtitleElement = $("diagramSubtitle");

        if (subtitleElement) {
            subtitleElement.textContent = selected.subtitle;
        }

        $("diagramSwitch").style.setProperty(
            "--dial-angle",
            "0deg"
        );

        $("diagramSwitch").setAttribute(
            "aria-valuenow",
            "1"
        );

        $("diagramSwitch").setAttribute(
            "aria-valuetext",
            selected.label
        );

        $("diagramSwitch").setAttribute(
            "aria-label",
            `Diagram selector. Current selection: ${selected.label}.`
        );

        document.querySelectorAll(".rotary-labels span").forEach(
            (label, index) => {

                label.classList.toggle(
                    "active",
                    index === 0
                );

            }
        );


        // 10. Update pressure options

        await updatePressureOptions();


        // 11. Update diagram and variable preview

        renderSelectedDiagram();

        updateVariablePreview();


        // 12. Store reset information

        setInformation("saveReset", {

            title: "Reset Information",

            paragraphs: [
                "All previous data has been cleared.",
                "Resetting removes all previous calculation results."
            ],

            summary:
                "Please save your data before resetting if you need it later."

        });


        // 13. Show confirmation

        setMessage(
            "generalMessage",
            "Reset completed!",
            "success"
        );

    } catch (error) {

        console.error("Reset error:", error);

        setMessage(
            "generalMessage",
            "Reset failed: " + error.message,
            true
        );

    }

}


// ==================================================
// RESET BUTTON
// ==================================================

$("resetButton").addEventListener("click", async () => {

    // If results were successfully saved, reset immediately
    if (resultsSaved) {

        await performReset();

        return;
    }


    // Ask whether to reset without saving
    const confirmReset = confirm(
        "Reset without Saving?"
    );


    // No / Cancel: do nothing
    if (!confirmReset) {

        return;
    }


    // Yes / OK: perform reset
    await performReset();

});

// ==================================================
// HELP AND MANUAL
// ==================================================

$("manualButton").addEventListener("click", () => {

    setMessage(
        "generalMessage",
        "The user manual has been saved as a pdf on your local drive."
    );
});


// ==================================================
// INITIAL SETUP
// ==================================================

updateVariablePreview();

updatePressureOptions();

renderResultsTable();

setDisplayView("variables");

selectDiagram(0);