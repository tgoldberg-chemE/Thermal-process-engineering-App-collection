const APP_ROOT = document.querySelector('meta[name="app-root"]')?.content || "";
// ==================================================
// GLOBAL DATA
// ==================================================

const $ = id => document.getElementById(id);

let vleData = null;
let stageData = null;
let enthalpyData = null;

let resultsSaved = false;
let selectedDiagram = 0;

let stageHistory = [];
let calculationHistory = [];

// h-x-y diagram scaling
let hxyVleXRange = null;
let hxyVleYRange = null;

let hxyScaleMode = "auto";
let hxyScaleRevision = 0;

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
    "caloricA",
    "caloricF",
    "caloricE"
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


// ==================================================
// DIAGRAM INFORMATION
// Order: Y-X, T-X-Y, N-X-T, H-X-Y
// ==================================================

const diagramInfo = [
    {
        key: "hxy",
        label: "h – x,y",
        title: "Ponchon-Savarit (h-x,y) Diagram",
        subtitle: "Enthalpy-composition diagram"
    },
    {
        key: "yx",
        label: "y – x",
        title: "y-x Diagram",
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
// STATUS MESSAGES – GLOBAL + LOCAL
// ==================================================

function setMainStatus(message, status = "success") {

    const statusPill = document.querySelector(".status-pill");
    const statusText = $("appStatus");

    if (!statusPill || !statusText) {
        console.warn("Global status elements not found.");
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


// --------------------------------------------------
// LOCAL CALCULATION MESSAGES
// Supports old Boolean error calls
// --------------------------------------------------

function setMessage(id, message, status = "success") {

    const element = $(id);

    if (!element) return;

    // Backwards compatibility:
    // true  = error
    // false = success
    if (typeof status === "boolean") {
        status = status ? "error" : "success";
    }

    element.textContent = message || "";

    element.classList.remove(
        "status-success",
        "status-info",
        "status-warning",
        "status-error"
    );

    if (message) {
        element.classList.add(`status-${status}`);
    }
}


// --------------------------------------------------
// DIAGRAM MESSAGE
// --------------------------------------------------

function showDiagramMessage(message) {

    const notice = $("chartNotice");

    if (notice) {
        notice.textContent = message;
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

async function updatePressureOptions() {

    const mixtureElement = $("mixture");
    const pressureSelect = $("pressure");

    if (!mixtureElement || !pressureSelect) return;

    const mixture = mixtureElement.value;

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
    }
}


// ==================================================
// MIXTURE SELECTION
// ==================================================

$("mixture").addEventListener("change", async () => {

    // Clear calculation data
    vleData = null;
    stageData = null;
    enthalpyData = null;

    hxyVleXRange = null;
    hxyVleYRange = null;
    hxyScaleMode = "auto";

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
// CALORIC FACTORS INPUT VALIDATION
// ==================================================

const caloricInputs = [
    {
        element: $("caloricA"),
        defaultValue: 0.8,
        min: 0.7,
        max: 1.0
    },
    {
        element: $("caloricF"),
        defaultValue: 1.0,
        min: -0.2,
        max: 1.1
    },
    {
        element: $("caloricE"),
        defaultValue: 1.0,
        min: 1.0,
        max: 1.1
    }
];

caloricInputs.forEach(({ element, defaultValue, min, max }) => {

    if (!element) return;

    element.addEventListener("change", () => {

        let value = Number(element.value);

        if (
            element.value.trim() === "" ||
            !Number.isFinite(value)
        ) {
            value = defaultValue;
        }

        value = Math.max(min, Math.min(max, value));

        element.value = value.toFixed(2);

        resultsSaved = false;
    });

});


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

        cell.colSpan = 21;
        cell.className = "empty-state";
        cell.textContent = "No separation stage calculations yet.";

        row.appendChild(cell);
        tbody.appendChild(row);

        return;
    }

    const decimalPlaces = [
        null, // Mixture
        3,    // Pressure
        2,    // Feed
        2,    // Distillate
        2,    // Bottom
        2,    // Reflux

        2,    // q B
        1,    // T B
        2,    // q F
        1,    // T F
        2,    // q D
        1,    // T D

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

            result.qA,
            result.temperature_bottom,
            result.qF,
            result.temperature_feed,
            result.qE,
            result.temperature_distillate,


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


/* ========================================
   CALORIC FACTORS – KNOB SYNCHRONISATION
======================================== */

function initializeCaloricKnobs() {

    document.querySelectorAll(".q-knob").forEach(knob => {

        const input = document.getElementById(
            knob.dataset.target
        );

        if (!input) return;

        const min = Number(input.min);
        const max = Number(input.max);
        const step = Number(input.step) || 0.01;

        const pointer = knob.querySelector(
            ".q-knob-pointer"
        );

        let dragging = false;

        function updateKnob(value) {

            const normalized = Math.max(
                0,
                Math.min(1, (value - min) / (max - min))
            );

            const angle = -135 + normalized * 270;

            pointer.style.transform =
                `translateX(-50%) rotate(${angle}deg)`;

            knob.setAttribute("aria-valuenow", value);
        }

        function updateInput(value) {

            const clamped = Math.max(
                min,
                Math.min(max, value)
            );

            const stepped =
                Math.round((clamped - min) / step) * step + min;

            const decimals = Math.max(
                0,
                (String(step).split(".")[1] || "").length
            );

            input.value = stepped.toFixed(decimals);

            updateKnob(Number(input.value));
        }

        // Numeric input -> rotary knob
        input.addEventListener("input", () => {

            const value = Number(input.value);

            if (input.value !== "" && Number.isFinite(value)) {
                updateKnob(value);
            }
        });

        input.addEventListener("change", () => {

            if (input.value === "") {
                updateInput(min);
                return;
            }

            updateInput(Number(input.value));
        });

        // Rotary knob -> numeric input
        function setFromPointer(event) {

            const rect = knob.getBoundingClientRect();

            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const dx = event.clientX - centerX;
            const dy = event.clientY - centerY;

            let angle = Math.atan2(dy, dx) * 180 / Math.PI;

            // Restrict the dial to a 270° rotation
            angle = Math.max(-135, Math.min(135, angle));

            const normalized = (angle + 135) / 270;

            const value = min + normalized * (max - min);

            updateInput(value);
        }

        knob.addEventListener("pointerdown", event => {

            dragging = true;
            knob.setPointerCapture(event.pointerId);

            setFromPointer(event);
        });

        knob.addEventListener("pointermove", event => {

            if (!dragging) return;

            setFromPointer(event);
        });

        knob.addEventListener("pointerup", () => {
            dragging = false;
        });

        knob.addEventListener("pointercancel", () => {
            dragging = false;
        });

        // Keyboard support
        knob.addEventListener("keydown", event => {

            let value = Number(input.value);

            if (event.key === "ArrowUp" ||
                event.key === "ArrowRight") {
                value += step;
            }
            else if (event.key === "ArrowDown" ||
                     event.key === "ArrowLeft") {
                value -= step;
            }
            else if (event.key === "Home") {
                value = min;
            }
            else if (event.key === "End") {
                value = max;
            }
            else {
                return;
            }

            event.preventDefault();
            updateInput(value);
        });

        // Initial position
        updateInput(Number(input.value));

    });
}

initializeCaloricKnobs();

