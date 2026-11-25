const APP_ROOT = document.querySelector('meta[name="app-root"]')?.content || "";
// =========================================================
// GLOBAL STATE
// =========================================================

const $ = id => document.getElementById(id);

window.lleResult = null;
window.stageResult = null;

const calculationHistory = [];

let resultsSaved = false;

window.solventMode = "flow";
window.calculationCriterion = "xr";
window.phaseFlow = "cross";

const ternDiagButton = document.getElementById("ternDiagButton");
const autoScaleButton = document.getElementById("autoScaleButton");

function updateVariablesLegend(flow) {
    document.querySelectorAll("[data-legend-mode]").forEach(element => {
        const isVisible = element.dataset.legendMode === flow;
        element.classList.toggle("hidden", !isVisible);
    });
}

// ==================================================
// TRACK UNSAVED CHANGES
// ==================================================

const calculationInputIds = [
    "mixture",
    "temperature",
    "feedComposition",
    "solventComposition",
    "solventFactor",
    "xrLimit",
    "yeLimit"
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

// Initialize the variables legend.
updateVariablesLegend(window.phaseFlow);

// ==================================================
// RESULTS TABLE
// ==================================================
function switchDisplayView(view) {
    const variablesView = $("variablesView");
    const resultsView = $("resultsView");

    document.querySelectorAll("[data-view]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.view === view
        );
    });

    variablesView?.classList.toggle("hidden", view !== "variables");
    resultsView?.classList.toggle("hidden", view !== "results");
}

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
        switchDisplayView(button.dataset.view);
    });
});

function renderResultsTable() {

    const tbody = $("resultsTableBody");
    const count = $("resultsCount");

    if (!tbody || !count) return;

    tbody.replaceChildren();

    count.textContent =
        `${calculationHistory.length} calculation${calculationHistory.length === 1 ? "" : "s"}`;

    if (calculationHistory.length === 0) {

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 16;
        cell.className = "empty-state";
        cell.textContent = "No separation stage calculations yet.";

        row.appendChild(cell);
        tbody.appendChild(row);

        return;
    }

    const decimalPlaces = [
        null, // Mixture
        2,    // Temperature
        null, // Phase flow
        2,    // Feed
        2,    // Solvent
        2,    // Solvent factor
        null, // Solvent addition
        null, // Boundary condition
        0,    // Number of stages
        2,    // Yield
        3,    // Minimum solvent ratio
        3,    // Solvent ratio
        3,    // Xi
        3,    // Final raffinate
        3,    // First extract
        3     // Extract at minimum solvent ratio
    ];

    calculationHistory.forEach(result => {

        const row = document.createElement("tr");

        const values = [
            result.mixture,
            result.temperature,
            result.phaseFlow,
            result.feed,
            result.solvent,
            result.factor,
            result.solventAddition,
            result.boundaryCondition,
            result.stages,
            result.yield,
            result.nuMin,
            result.nu,
            result.xi,
            result.finalXR,
            result.firstYE,
            result.yEMin
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
// SAVE EXTRACTION CALCULATION
// ==================================================

function saveExtractionCalculation(data) {

    const isCounterCurrent = window.phaseFlow === "counter";

    const finalXR = data.X_R[data.X_R.length - 1];

    const firstYE = Array.isArray(data.Y_E[0])
        ? data.Y_E[0][1]
        : data.Y_E[1];

    const boundaryCondition =
        window.calculationCriterion === "xr"
            ? `xR ≤ ${Number($("xrLimit").value).toFixed(2)}`
            : `Yield ≥ ${Number($("yeLimit").value).toFixed(1)}%`;

    const result = {

        mixture: $("mixture")?.selectedOptions[0]?.textContent || "–",

        temperature: Number($("temperature").value),

        phaseFlow: isCounterCurrent
            ? "Counter-current"
            : "Cross-current",

        feed: Number($("feedComposition").value),

        solvent: Number($("solventComposition").value),

        factor: Number($("solventFactor").value),

        solventAddition: isCounterCurrent
            ? "–"
            : window.solventMode === "ratio"
                ? "Constant ratio"
                : "Constant flow",

        boundaryCondition,

        stages: data.stages === "∞"
            ? "∞"
            : Number(data.stages),

        yield: Number(data["yield"]),

        nuMin: Number(data.nu_min),

        nu: Number(data.nu),

        xi: Number(data.xi),

        finalXR: Array.isArray(finalXR)
            ? Number(finalXR[1])
            : null,

        firstYE: Number(firstYE),

        yEMin: Number(data.Y_MAX[1])

    };

    calculationHistory.push(result);

    renderResultsTable();
}

// ==================================================
// INFORMATION AND STATUS SYSTEM
// ==================================================

const informationState = {
    lle: null,
    extraction: null,
    general: null
};

let activeInformationType = null;

const defaultInformation = {
    title: "Additional Information",
    paragraphs: [
        "Select a question mark to display additional information."
    ]
};


// ==================================================
// SET STATUS
// ==================================================

function setStatusMessage(id, message, status = "info") {

    const element = $(id);

    if (!element) return;

    element.textContent = message;

    element.classList.remove(
        "status-success",
        "status-warning",
        "status-error",
        "status-info"
    );

    element.classList.add(`status-${status}`);
}

function setMainStatus(message, status = "success") {
    const appStatus = $("appStatus");
    const statusPill = appStatus?.closest(".status-pill");

    if (appStatus) {
        appStatus.textContent = message;
    }

    statusPill?.classList.remove("warning", "error");

    if (status === "warning" || status === "error") {
        statusPill?.classList.add(status);
    }
}

function isNormalStageCalculation(data) {
    return (
        Number.isFinite(Number(data.stages)) &&
        data.stages !== "∞" &&
        data.stopped_by !== "max_stages" &&
        data.stopped_by !== "minimum_solvent_ratio" &&
        (!Array.isArray(data.warnings) || data.warnings.length === 0)
    );
}

// ==================================================
// SET INFORMATION
// ==================================================

function setCalculationStatus(type, status, message, details = null) {

    const messageIds = {
        lle: "lleMessage",
        extraction: "extractionMessage",
        general: "generalMessage"
    };

    if (!messageIds[type]) return;

    setStatusMessage(messageIds[type], message, status);

    informationState[type] = details;

    if (activeInformationType === type) {
        renderInformation();
    }
}


// ==================================================
// CLEAR INFORMATION
// ==================================================

function clearCalculationStatus(type) {

    const messageIds = {
        lle: "lleMessage",
        extraction: "extractionMessage",
        general: "generalMessage"
    };

    if (!messageIds[type]) return;

    setStatusMessage(messageIds[type], "", "info");

    informationState[type] = null;

    if (activeInformationType === type) {
        renderInformation();
    }
}


// ==================================================
// RENDER INFORMATION
// ==================================================

function createInformationElement(tag, text, className = "") {

    const element = document.createElement(tag);

    element.textContent = String(text ?? "");

    if (className) {
        element.className = className;
    }

    return element;
}


function renderInformation() {

    const output = $("infoOutput");

    if (!output) return;

    output.replaceChildren();

    const content =
        informationState[activeInformationType] || defaultInformation;

    if (content.title) {
        output.appendChild(
            createInformationElement("h3", content.title)
        );
    }

    (content.paragraphs || []).forEach(paragraph => {

        output.appendChild(
            createInformationElement("p", paragraph)
        );

    });

    if (Array.isArray(content.warnings)) {

        const container = document.createElement("div");
        container.className = "information-warnings";

        content.warnings.forEach(warning => {

            const element = document.createElement("div");
            element.className = "information-warning";

            element.appendChild(
                createInformationElement(
                    "h4",
                    warning.title || "Warning"
                )
            );

            if (warning.message) {
                element.appendChild(
                    createInformationElement("p", warning.message)
                );
            }

            if (warning.recommendation) {
                element.appendChild(
                    createInformationElement(
                        "p",
                        warning.recommendation,
                        "warning-recommendation"
                    )
                );
            }

            container.appendChild(element);

        });

        output.appendChild(container);
    }

    if (Array.isArray(content.items)) {

        const list = document.createElement("ul");

        content.items.forEach(item => {

            const element = document.createElement("li");

            if (typeof item === "string") {

                element.textContent = item;

            } else {

                element.appendChild(
                    createInformationElement("strong", item.label || "")
                );

                element.appendChild(
                    document.createTextNode(` ${item.value ?? ""}`)
                );

            }

            list.appendChild(element);

        });

        output.appendChild(list);
    }

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


// ==================================================
// SHOW INFORMATION
// ==================================================

function showInformation(type) {

    if (!Object.prototype.hasOwnProperty.call(informationState, type)) {
        return;
    }

    activeInformationType = type;

    renderInformation();
}


// ==================================================
// HELP BUTTONS
// ==================================================

document.querySelectorAll(".help-icon").forEach(button => {

    button.addEventListener("click", () => {
        showInformation(button.dataset.info);
    });

});

renderInformation();


function updateInputLimits() {
    const feedInput = $("feedComposition");
    const raffinateInput = $("xrLimit");

    if (!feedInput || !raffinateInput) return;

    const xF = Number(feedInput.value);

    if (!Number.isFinite(xF)) return;

    // xR target must be at least 0.02 and strictly smaller than xF.
    const maxXR = Math.min(1, xF - 0.01);

    raffinateInput.max = maxXR.toFixed(2);

    if (maxXR < 0.02) {
        raffinateInput.setCustomValidity(
            "xF must be greater than 0.02."
        );
        return;
    }

    raffinateInput.setCustomValidity("");

    if (Number(raffinateInput.value) > maxXR ||
        Number(raffinateInput.value) < 0.02) {
        raffinateInput.value = Math.min(
            0.10,
            maxXR
        ).toFixed(2);
    }
}

$("feedComposition")?.addEventListener("input", updateInputLimits);

$("xrLimit")?.addEventListener("input", () => {
    const xF = Number($("feedComposition").value);
    const xR = Number($("xrLimit").value);

    $("xrLimit").setCustomValidity(
        xR >= xF
            ? "Must be smaller than xF."
            : xR < 0.02
                ? "Must be at least 0.02."
                : ""
    );
});


updateInputLimits();

function validateExtractionInputs() {
    const ids = [
        "feedComposition",
        "solventComposition",
        "solventFactor",
        "xrLimit",
        "yeLimit"
    ];

    const messages = {
        feedComposition: "xF must be between 0 and 1.",
        solventComposition: "yS must be between 0 and 0.99.",
        solventFactor: "Solvent factor must be at least 1.",
        xrLimit: "xR target must be at least 0.02 and smaller than xF.",
        yeLimit: "Yield target must be between 0 and 100%."
    };

    for (const id of ids) {
        const input = $(id);
        if (!input) continue;

        input.setCustomValidity("");

        if (!input.checkValidity()) {
            input.setCustomValidity(messages[id]);
            input.reportValidity();
            return false;
        }
    }

    const xF = Number($("feedComposition").value);
    const xR = Number($("xrLimit").value);

    if (window.calculationCriterion === "xr" && xR >= xF) {
        $("xrLimit").setCustomValidity(
            "xR target must be smaller than xF."
        );
        $("xrLimit").reportValidity();
        return false;
    }

    $("xrLimit").setCustomValidity("");

    return true;
}

function setCounterCurrentScale(mode) {
    const chart = document.getElementById("mainChart");
    const h = Math.sqrt(3) / 2;

    if (mode === "ternary") {
        // Vollständiges ternäres Diagramm anzeigen
        Plotly.relayout(chart, {
            "xaxis.autorange": false,
            "yaxis.autorange": false,
            "xaxis.range": [-0.10, 1.10],
            "yaxis.range": [-0.10, h + 0.12]
        });
    } else {
        // Sichtbaren Bereich automatisch an die Daten anpassen
        Plotly.relayout(chart, {
            "xaxis.autorange": true,
            "yaxis.autorange": true
        });
    }

    ternDiagButton.classList.toggle("active", mode === "ternary");
    autoScaleButton.classList.toggle("active", mode === "autoscale");
}

ternDiagButton.addEventListener("click", () => {
    setCounterCurrentScale("ternary");
});

autoScaleButton.addEventListener("click", () => {
    setCounterCurrentScale("autoscale");
});



// =========================================================
// 2. PHASE FLOW: CROSS-CURRENT / COUNTER-CURRENT
// =========================================================

document.querySelectorAll("[data-flow]").forEach(button => {

    button.addEventListener("click", () => {

        document.querySelectorAll("[data-flow]").forEach(b => {
            b.classList.toggle("active", b === button);
        });

        const isCounterFlow = button.dataset.flow === "counter";

        window.phaseFlow = isCounterFlow ? "counter" : "cross";
        resultsSaved = false;
        updateVariablesLegend(window.phaseFlow);

        const flowchartImage = $("flowchartImage");
        const solventToggle = $("solventModeToggle");
        const solventSection = $("solventModeSwitch");
        const hint = $("solventDisabledHint");

        if (flowchartImage) {
            flowchartImage.src = isCounterFlow
                ? `${APP_ROOT}/static/images/CounterCurrent.png`
                : `${APP_ROOT}/static/images/watermark.png`;
        }

        if (solventToggle) {
            solventToggle.disabled = isCounterFlow;
        }

        solventSection?.classList.toggle("disabled", isCounterFlow);

        if (hint) {
            hint.hidden = !isCounterFlow;
        }

        // Clear previous extraction results
        clearCalculationStatus("extraction");

        // Vorherige Ergebnisse nicht als Ergebnisse der
        // neu gewählten Betriebsart anzeigen.
        window.stageResult = null;

        [
            "resultN",
            "resultYield",
            "resultNuMin",
            "resultNu",
            "resultXR",
            "resultYE1",
            "resultXi",
            "resultYEvMin"
        ].forEach(id => {
            if ($(id)) $(id).value = "";
        });

        if ($("stageCount")) {
            $("stageCount").textContent = "0";
        }

        if (window.lleResult && typeof plotLLE === "function") {
            showTernaryDiagram();
        }
    });

});


// =========================================================
// 3. SOLVENT ADDITION MODE
// =========================================================

const solventToggle = $("solventModeToggle");
const solventSwitch = $("solventModeSwitch");


function setSolventMode(mode) {
    resultsSaved = false;
    const isRatio = mode === "ratio";

    if (solventToggle) {
        solventToggle.checked = isRatio;
    }

    if (solventSwitch) {

        solventSwitch.querySelector('[data-label="flow"]')
            ?.classList.toggle("active", !isRatio);

        solventSwitch.querySelector('[data-label="ratio"]')
            ?.classList.toggle("active", isRatio);

    }

    window.solventMode = mode;

}


solventToggle?.addEventListener("change", () => {

    setSolventMode(
        solventToggle.checked ? "ratio" : "flow"
    );

});


// =========================================================
// 4. CALCULATION CRITERION
// =========================================================

const criterionToggle = $("criterionToggle");
const criterionSwitch = $("criterionSwitch");


function setCriterion(value) {
    resultsSaved = false;
    const useYE = value === "ye";

    if (criterionToggle) {
        criterionToggle.checked = useYE;
    }

    if (criterionSwitch) {

        criterionSwitch.querySelector('[data-label="xr"]')
            ?.classList.toggle("active", !useYE);

        criterionSwitch.querySelector('[data-label="ye"]')
            ?.classList.toggle("active", useYE);

    }

    $("xrCriterionFields")?.classList.toggle("hidden", useYE);
    $("yeCriterionFields")?.classList.toggle("hidden", !useYE);

    window.calculationCriterion = value;

}


criterionToggle?.addEventListener("change", () => {

    setCriterion(
        criterionToggle.checked ? "ye" : "xr"
    );

});


// =========================================================
// 5. DIAGRAM SELECTOR: TERNARY / K-X
// =========================================================
function showTernaryDiagram() {
    const diagramRange = $("diagramRange");

    if (diagramRange) {
        diagramRange.value = "0";

        diagramRange.dispatchEvent(new Event("input", {
            bubbles: true
        }));
    } else {
        setDiagram(0);
    }
}

function setDiagram(index) {

    const isTernary = Number(index) === 0;

    const diagramRange = $("diagramRange");

    const diagramLabels = document.querySelectorAll(
        "#diagramSelector .selector-option-label"
    );

    diagramLabels.forEach((label, i) => {
        label.classList.toggle("active", i === Number(index));
    });

    if (diagramRange) {
        diagramRange.value = isTernary ? 0 : 1;
    }

    $("diagramHighlight")?.parentElement?.classList.toggle(
        "is-kx",
        !isTernary
    );

    if ($("diagramTitle")) {
        $("diagramTitle").textContent = isTernary
            ? "Ternary diagram"
            : "K-x diagram";
    }

    if ($("diagramSelection")) {
        $("diagramSelection").textContent = isTernary
            ? "Ternary diagram"
            : "Distribution coefficient · K–x";
    }

    if ($("diagramPosition")) {
        $("diagramPosition").textContent = isTernary
            ? "DIAGRAM 01 / 02"
            : "DIAGRAM 02 / 02";
    }

    if ($("diagramHint")) {
        $("diagramHint").textContent = isTernary
            ? "VLE scale and autoscale available"
            : "Binary distribution coefficients";
    }

    $("ternaryScaleControls")?.classList.toggle(
        "hidden",
        !isTernary
    );


    // Redraw the selected diagram if data exists.
    if (isTernary) {

        if (window.lleResult) {

            if (window.stageResult) {

                if (
                    window.phaseFlow === "counter" &&
                    typeof plotCounterCurrent === "function"
                ) {
                    plotCounterCurrent(
                        window.lleResult,
                        window.stageResult
                    );

                } else if (typeof plotCrossCurrent === "function") {
                    plotCrossCurrent(
                        window.lleResult,
                        window.stageResult
                    );
                }

            } else if (typeof plotLLE === "function") {
                plotLLE(window.lleResult);
            }
        }

    } else {

        if (
            window.lleResult &&
            typeof plotKXDiagram === "function"
        ) {
            plotKXDiagram(
                window.lleResult,
                window.stageResult
            );
        }
    }

}


$("diagramRange")?.addEventListener("input", event => {

    setDiagram(event.target.value);

});


// =========================================================
// 6. TERNARY DIAGRAM SCALE
// =========================================================

["vleScaleButton", "autoScaleButton"].forEach(id => {

    $(id)?.addEventListener("click", () => {

        $("vleScaleButton")?.classList.toggle(
            "active",
            id === "vleScaleButton"
        );

        $("autoScaleButton")?.classList.toggle(
            "active",
            id === "autoScaleButton"
        );

        // Diagram scale handling belongs to diagrams.js.
        if (typeof updateTernaryScale === "function") {
            updateTernaryScale(id);
        }

    });

});



// =========================================================
// 8. RESET
// =========================================================

// ==================================================
// CLEAR RESULTS
// ==================================================

function clearResults() {
    resultsSaved = false;
    window.lleResult = null;
    window.stageResult = null;

    [
        "resultN",
        "resultYield",
        "resultNuMin",
        "resultNu",
        "resultXR",
        "resultYE1",
        "resultXi",
        "resultYEvMin"
    ].forEach(id => {

        if ($(id)) {
            $(id).value = "";
        }

    });

    if ($("stageCount")) {
        $("stageCount").textContent = "0";
    }

    if ($("appStatus")) {
        $("appStatus").textContent = "Ready";
    }

    clearCalculationStatus("lle");
    clearCalculationStatus("extraction");
    clearCalculationStatus("general");

        // Clear calculation history.
    calculationHistory.length = 0;
    renderResultsTable();
    
    if (typeof clearDiagram === "function") {
        clearDiagram();
    }


    // Reset main status to green.
setMainStatus("Ready", "success");
}

// ==================================================
// RESET
// ==================================================

function performReset() {

    // Reset input fields.
    document.querySelectorAll(".right-panel input").forEach(input => {

        if (input.type === "range") {

            input.value = input.defaultValue;

        } else if (input.type === "checkbox") {

            input.checked = input.defaultChecked;

        } else if (
            input.type === "number" &&
            !input.readOnly
        ) {

            input.value = input.defaultValue;

        } else if (
            input.type === "text" &&
            input.readOnly
        ) {

            input.value = "";

        }

    });

    // Reset phase flow.
    window.phaseFlow = "cross";
    updateVariablesLegend(window.phaseFlow);

    document.querySelectorAll("[data-flow]").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.flow === "cross"
        );
    });

    if ($("flowchartImage")) {
        $("flowchartImage").src = `${APP_ROOT}/static/images/CrossFlow.png`;
    }

    // Re-enable solvent mode.
    if ($("solventModeToggle")) {
        $("solventModeToggle").disabled = false;
    }

    $("solventModeSwitch")?.classList.remove("disabled");

    if ($("solventDisabledHint")) {
        $("solventDisabledHint").hidden = true;
    }

    // Reset calculation settings and results.
    setSolventMode("flow");
    setCriterion("xr");
    setDiagram(0);

    clearResults();

    resultsSaved = false;
}


// Reset only after confirmation when results are unsaved.
$("resetButton")?.addEventListener("click", () => {

    if (!resultsSaved) {

        const confirmReset = confirm("Reset without Saving?");

        if (!confirmReset) {
            return;
        }

    }

    performReset();

});




// =========================================================
// 10. LLE DATA VALIDATION
// =========================================================

function validateLLEData(data) {

    if (!data || typeof data !== "object") {
        throw new Error("Invalid LLE response.");
    }

    if (!Array.isArray(data.X_P1)) {
        throw new Error("X_P1 is missing from the LLE response.");
    }

    if (!Array.isArray(data.X_P2)) {
        throw new Error("X_P2 is missing from the LLE response.");
    }

    if (!Array.isArray(data.X_PP) || data.X_PP.length !== 3) {
        throw new Error("X_PP is missing or invalid.");
    }

    if (data.X_P1.length < 2 || data.X_P2.length < 2) {
        throw new Error("The binodal contains insufficient points.");
    }

    return true;

}


// =========================================================
// 11. INITIAL UI STATE
// =========================================================

setSolventMode("flow");
setCriterion("xr");
setDiagram(0);


// =========================================================
// 12. INITIALIZE TERNARY DIAGRAM
// =========================================================

if (typeof initializeTernaryDiagram === "function") {

    initializeTernaryDiagram();

} else {

    console.warn(
        "initializeTernaryDiagram() was not found. Check diagrams.js."
    );

}


$("mixture")?.addEventListener("change", () => {

    window.lleResult = null;
    window.stageResult = null;

    clearCalculationStatus("lle");
    clearCalculationStatus("extraction");

    if (typeof updateTernaryLayout === "function") {
        updateTernaryLayout();
    }

    clearResults();

});


// =========================================================
// 13. CALCULATE LLE
// =========================================================

$("calculateLLE")?.addEventListener("click", async () => {

    const mixture = $("mixture").value;
    const temperature = Number($("temperature").value);

    const message = $("lleMessage");
    const button = $("calculateLLE");

    if (!mixture || !Number.isFinite(temperature)) {

        setCalculationStatus(
            "lle",
            "error",
            "Please select a mixture and temperature.",
            {
                title: "Invalid LLE Input",
                paragraphs: [
                    "A valid mixture and temperature must be selected before calculating liquid-liquid equilibrium."
                ],
                summary: "Check the input parameters and try again."
            }
        );

        return;
    }

    button.disabled = true;
    button.textContent = "Calculating...";

    setCalculationStatus(
    "lle",
    "info",
    "LLE calculation in progress...",
    {
        title: "LLE Calculation",
        paragraphs: [
            "The liquid-liquid equilibrium calculation is currently running.",
            "The binodal curve and equilibrium data are being generated."
        ]
    }
    );

    if ($("appStatus")) {
        $("appStatus").textContent = "Calculating LLE...";
    }

    try {

        const response = await fetch(`${APP_ROOT}/calculate-lle`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                mixture: mixture,
                temperature: temperature,
                x2: 0.01

            })

        });

        const responseText = await response.text();

        console.log("LLE HTTP status:", response.status);
        console.log("LLE response:", responseText);

        let data;

        try {

            data = JSON.parse(responseText);

        } catch {

            throw new Error(
                "Flask returned HTML or invalid JSON. Check the Python terminal."
            );

        }

        if (!response.ok) {

            throw new Error(
                data.error || "LLE calculation failed."
            );

        }

        validateLLEData(data);

        window.lleResult = data;
        resultsSaved = false;
        window.stageResult = null;

        clearResults();

        // clearResults() also resets stageResult, but keeps LLE data.
        window.lleResult = data;

        if (typeof plotLLE === "function") {
            showTernaryDiagram();
        } else {

            console.warn("plotLLE() was not found in diagrams.js.");

        }

        setCalculationStatus(
            "lle",
            "success",
            "LLE calculated!",
            {
                title: "Liquid-Liquid Equilibrium Calculation",
                paragraphs: [
                    "The liquid-liquid equilibrium calculation was completed successfully.",
                    "The binodal curves, tie lines and plait point are available in the ternary diagram."
                ],
            }
        );

        if ($("appStatus")) {
            $("appStatus").textContent = "LLE completed";
        }

    } catch (error) {

        console.error("LLE calculation error:", error);

        setCalculationStatus(
            "lle",
            "error",
            error.message || "LLE calculation failed.",
            {
                title: "LLE Calculation – Error",
                paragraphs: [
                    error.message || "An unexpected error occurred during the LLE calculation."
                ],
                summary: "Check the mixture, temperature and calculation data."
            }
        );

        if ($("appStatus")) {
            $("appStatus").textContent = "LLE calculation failed";
        }

        window.lleResult = null;
        window.stageResult = null;

    } finally {

        button.disabled = false;
        button.textContent = "Calculate LLE";

    }

});


// =========================================================
// 14. BUILD MATLAB COMPOSITIONS
// =========================================================

function buildFeedComposition(feedValue) {

    // MATLAB:
    // app.xFeed = [0 app.xF.Value 1-app.xF.Value];

    return [
        0,
        feedValue,
        1 - feedValue,
    ];

}


function buildSolventComposition(solventValue) {

    // MATLAB:
    // app.ySolvent = [1-app.yS.Value app.yS.Value 0];

    return [
        1 - solventValue,
        solventValue,
        0
    ];

}

// =========================================================
// 15. VALIDATE EXTRACTION RESPONSE
// =========================================================

function validateExtractionData(data) {

    const requiredKeys = [
        "X_R",
        "Y_E",
        "Y_MAX",
        "stages",
        "yield",
        "nu",
        "nu_min",
        "xi"
    ];

    for (const key of requiredKeys) {
        if (!(key in data)) {
            console.error("Missing result field:", key, data);
            throw new Error(
                `Extraction response is missing ${key}.`
            );
        }
    }

    if (!Array.isArray(data.X_R)) {
        throw new Error("X_R must be a valid array.");
    }

    if (!Array.isArray(data.Y_E)) {
        throw new Error("Y_E must be a valid array.");
    }

    if (!Array.isArray(data.Y_MAX) || data.Y_MAX.length < 2) {
        throw new Error("Y_MAX must contain at least two components.");
    }

    if (!Number.isFinite(Number(data.Y_MAX[1]))) {
        throw new Error("Y_MAX[1] must be a valid number.");
    }

    return true;
}


// =========================================================
// EXTRACTION INFORMATION
// =========================================================


function buildExtractionInformation(data, modeName) {

    const warnings = Array.isArray(data.warnings)
        ? [...data.warnings]
        : [];

    const details = {
        title: `${modeName} Extraction`,
        paragraphs: [],
        summary: [
            `Number of theoretical stages: ${data.stages >= 100 ? ">100" : data.stages}`
        ],
        warnings
    };

    if (data.stopped_by === "minimum_solvent_ratio") {
        details.warnings.push({
            title: "Minimum solvent-to-feed ratio!",
            message:
                "The minimum solvent-to-feed ratio has been reached. No extraction takes place under these conditions.",
            recommendation:
                "Increase the solvent-to-feed ratio factor f to perform an actual extraction."
        });
    }

    if (data.stopped_by === "max_stages") {
        details.warnings.push({
            title: "Maximum number of stages reached!",
            message:
                "Calculation forced to stop: maximum predefined number of separation stages reached.",
            recommendation:
                "Review and adjust the operating conditions."
        });
    }

    if (data.stages === "∞") {
        details.warnings.push({
            title: "Infinite number of separation stages!",
            message:
                "The selected operating conditions correspond to an infinite number of theoretical separation stages.",
            recommendation:
                "Increase the solvent-to-feed ratio factor f or revise other operating conditions."
        });
    }

    // Display the success message only if no warnings occurred.
    if (details.warnings.length === 0) {
        details.paragraphs.push(
            "The extraction process has been successfully calculated."
        );
    }

    return details;
}



// =========================================================
// 16. UPDATE EXTRACTION RESULTS
// =========================================================

function updateExtractionResults(data) {

    const stageDisplay =
        data.stages === "∞"
            ? "∞"
            : Number(data.stages) >= 100
                ? "> 100"
                : data.stages;

    // Update stage count below the schematic overview.
    if ($("stageCount")) {
        $("stageCount").textContent = stageDisplay;
    }

    // Update stage count in the results panel.
    if ($("resultN")) {
        $("resultN").value = stageDisplay;
    }

    if ($("resultYield")) {
        $("resultYield").value =
            Number(data["yield"]).toFixed(2);
    }

    if ($("resultNuMin")) {
        $("resultNuMin").value =
            Number(data.nu_min).toFixed(3);
    }

    if ($("resultNu")) {
        $("resultNu").value =
            Number(data.nu).toFixed(3);
    }

    const finalXR = data.X_R[data.X_R.length - 1];

    if ($("resultXR")) {
        $("resultXR").value = finalXR
            ? Number(finalXR[1]).toFixed(3)
            : "-";
    }

    if ($("resultYE1")) {
        const yE1 = Array.isArray(data.Y_E[0])
            ? data.Y_E[0][1]
            : data.Y_E[1];

        $("resultYE1").value =
            Number.isFinite(Number(yE1))
                ? Number(yE1).toFixed(3)
                : "-";
    }

    // Additional extraction results
    if ($("resultXi")) {
        $("resultXi").value =
            Array.isArray(data.xi) && data.xi.length === 0
                ? "-"
                : data.xi != null
                    ? Number(data.xi).toFixed(3)
                    : "-";
    }

    if ($("resultYEvMin")) {
        $("resultYEvMin").value =
            Number(data.Y_MAX[1]).toFixed(3);
    }

}

// =========================================================
// 17. CALCULATE EXTRACTION: CROSS-CURRENT / COUNTER-CURRENT
// =========================================================

$("calculateExtraction")?.addEventListener("click", async () => {

    const message = $("extractionMessage");
    const button = $("calculateExtraction");
    switchDisplayView("results");

    if (!validateExtractionInputs()) {
        return;
    }

    if (!window.lleResult) {

        setCalculationStatus(
            "extraction",
            "error",
            "Please calculate LLE first.",
            {
                title: "LLE Data Required",
                paragraphs: [
                    "Extraction cannot be calculated because no valid liquid-liquid equilibrium data are available."
                ],
                recommendation: "Calculate LLE before starting the extraction calculation."
            }
        );

        return;
    }

    const feedValue = Number($("feedComposition").value);
    const solventValue = Number($("solventComposition").value);
    const factor = Number($("solventFactor").value);


    const x_feed = buildFeedComposition(feedValue);
    const y_solvent = buildSolventComposition(solventValue);

    const X_P1 = window.lleResult.X_P1;
    const X_P2 = window.lleResult.X_P2;
    const X_PP = window.lleResult.X_PP;

    if (!Array.isArray(X_P1) ||
        !Array.isArray(X_P2) ||
        !Array.isArray(X_PP)) {

        setCalculationStatus(
            "extraction",
            "error",
            "LLE data are incomplete.",
            {
                title: "Incomplete LLE Data",
                paragraphs: [
                    "The extraction calculation requires X_P1, X_P2 and X_PP from the previous LLE calculation."
                ],
                summary: "Calculate LLE again and retry."
            }
        );

        return;
    }

    let xR_limit = null;
    let yield_limit = null;

    if (window.calculationCriterion === "xr") {
        xR_limit = Number($("xrLimit").value);

        if (!Number.isFinite(xR_limit)) {

            setCalculationStatus(
                "extraction",
                "error",
                "Invalid raffinate limit.",
                {
                    title: "Invalid Raffinate Limit",
                    paragraphs: [
                        "The raffinate composition limit must be a valid numerical value."
                    ]
                }
            );

            return;
        }
    } else {
        yield_limit = Number($("yeLimit").value);

        if (!Number.isFinite(yield_limit)) {

            setCalculationStatus(
                "extraction",
                "error",
                "Invalid extraction yield limit.",
                {
                    title: "Invalid Extraction Yield",
                    paragraphs: [
                        "The extraction yield limit must be a valid numerical value."
                    ]
                }
            );

            return;
        }
    }



    const isCounterCurrent = window.phaseFlow === "counter";

    const payload = {
        x_feed,
        y_solvent,
        X_P1,
        X_P2,
        X_PP,
        f: factor,
        xR_limit,
        yield_limit,
        max_stages: 100,
        feed: 1.0
    };

    // Only cross-current operation uses the solvent
    // addition mode options.
    if (!isCounterCurrent) {
        payload.nu_const = window.solventMode === "ratio";
        payload.S_const = window.solventMode === "flow";
    }

    const endpoint = isCounterCurrent
        ? `${APP_ROOT}/calculate-counter-current`
        : `${APP_ROOT}/calculate-cross-current`;

    const modeName = isCounterCurrent
        ? "Counter-current"
        : "Cross-current";

    button.disabled = true;
    button.textContent = "Calculating...";
    setCalculationStatus(
        "extraction",
        "info",
        `${modeName} extraction in progress...`,
        {
            title: `${modeName} Extraction`,
            paragraphs: [
                "The extraction calculation is currently running.",
                "The operating conditions, phase compositions and separation stages are being evaluated."
            ]
        }
        );

    if ($("appStatus")) {
        $("appStatus").textContent = `Calculating ${modeName.toLowerCase()}...`;
    }

    setMainStatus(`Calculating ${modeName.toLowerCase()}...`, "info");
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();

        console.log(`${modeName} HTTP status:`, response.status);
        console.log(`${modeName} response:`, responseText);

        let data;

        try {
            data = JSON.parse(responseText);
        } catch {
            throw new Error(
                "Flask returned invalid JSON. Check the Python terminal."
            );
        }


        if (!response.ok) {

            if (
                data.plot_data &&
                data.plot_data.type === "feed_solvent_line"
            ) {

                window.stageResult = null;

                // Preserve the feed-solvent line in the ternary diagram.
                if (isCounterCurrent) {

                    plotCounterCurrent(
                        window.lleResult,
                        null,
                        data.plot_data
                    );

                } else {

                    plotCrossCurrent(
                        window.lleResult,
                        null,
                        data.plot_data
                    );

                }
                setMainStatus("Extraction warning", "warning");
                setCalculationStatus(
                    "extraction",
                    "warning",
                    "Feed-solvent line does not intersect the immiscibility gap.",
                    {
                        title: "Feed-Solvent Line – Warning",
                        warnings: [
                            {
                                title: "No feasible mixing point",
                                message:
                                    data.error || "The selected feed and solvent compositions are not admissible.",
                                recommendation:
                                    "Check the specified feed and solvent compositions"
                            }
                        ]
                    }
                );

                if ($("appStatus")) {
                    $("appStatus").textContent = "Extraction warning";
                }

                return;
            }

            throw new Error(
                data.error || `${modeName} calculation failed.`
            );
        }

        validateExtractionData(data);

        window.stageResult = data;
        resultsSaved = false;
        // Reset the diagram selector to the ternary diagram.
        showTernaryDiagram();

        updateExtractionResults(data);

        if (isCounterCurrent) {
            if (typeof plotCounterCurrent === "function") {
                plotCounterCurrent(window.lleResult, data);
            } else {
                throw new Error(
                    "plotCounterCurrent() is missing in diagrams.js."
                );
            }
        } else {
            if (typeof plotCrossCurrent === "function") {
                plotCrossCurrent(window.lleResult, data);
            } else {
                throw new Error(
                    "plotCrossCurrent() is missing in diagrams.js."
                );
            }
        }

        // Save the completed extraction calculation.
        saveExtractionCalculation(data);

    const extractionDetails = buildExtractionInformation(data, modeName);
    const hasWarnings = extractionDetails.warnings.length > 0;

    if (hasWarnings) {
        const firstWarning = extractionDetails.warnings[0];

        setMainStatus("Calculation completed with warnings", "warning");

        setCalculationStatus(
            "extraction",
            "warning",
            firstWarning?.title || "Calculation completed with special conditions.",
            extractionDetails
        );
    } else {
        setMainStatus("Calculation completed", "success");

        setCalculationStatus(
            "extraction",
            "success",
            "Separation stages calculated!",
            extractionDetails
        );
    }

    } catch (error) {
        console.error(`${modeName} calculation error:`, error);

        setCalculationStatus(
            "extraction",
            "error",
            error.message || "Extraction calculation failed.",
            {
                title: `${modeName} Extraction – Error`,
                paragraphs: [
                    error.message || "An unexpected error occurred during the extraction calculation."
                ],
                summary: "Check the input parameters and operating conditions."
            }
        );


        setMainStatus("Extraction calculation failed", "error");

        window.stageResult = null;

    } finally {
        button.disabled = false;
        button.textContent = "Calculate extraction process";
    }

});


// ==================================================
// SAVE RESULTS
// ==================================================


async function saveResults() {

    if (!window.lleResult) {
        throw new Error("Please calculate LLE first.");
    }

    if (!window.stageResult) {
        throw new Error("Please calculate extraction first.");
    }

    const exportData = {
        lle: window.lleResult,
        extraction: window.stageResult,
        calculationHistory: calculationHistory,

        inputs: {
            mixture: $("mixture")?.selectedOptions[0]?.textContent || "",
            temperature: Number($("temperature")?.value),
            feedComposition: Number($("feedComposition")?.value),
            solventComposition: Number($("solventComposition")?.value),
            solventFactor: Number($("solventFactor")?.value),
            phaseFlow: window.phaseFlow,
            solventMode: window.solventMode,
            calculationCriterion: window.calculationCriterion,
            xrLimit: Number($("xrLimit")?.value),
            yieldLimit: Number($("yeLimit")?.value)
        }
    };

    const response = await fetch(`${APP_ROOT}/export-results`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(exportData)
    });

    if (!response.ok) {
        let errorMessage = "Excel export failed.";

        try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
        } catch {
            // Keep the default error message.
        }

        throw new Error(errorMessage);
    }

    const blob = await response.blob();

    if (!blob.size) {
        throw new Error("The exported Excel file is empty.");
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "LLE_Results.xlsx";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    resultsSaved = true;
}


// Save button handler
$("saveButton")?.addEventListener("click", async () => {

    const button = $("saveButton");

    button.disabled = true;
    button.textContent = "Saving...";

    try {

        await saveResults();

        setMainStatus("Results exported successfully", "success");

        setCalculationStatus(
            "general",
            "success",
            "Results saved successfully.",
            {
                title: "Export Completed",
                paragraphs: [
                    "The LLE and extraction results have been exported to an Excel file.",
                    "The file LLE_Results.xlsx has been downloaded."
                ]
            }
        );

    } catch (error) {

        console.error("Export error:", error);

        setMainStatus("Export failed", "error");

        setCalculationStatus(
            "general",
            "error",
            error.message || "Could not export results.",
            {
                title: "Export Failed",
                paragraphs: [
                    error.message || "An unexpected error occurred during the Excel export."
                ]
            }
        );

    } finally {

        button.disabled = false;
        button.textContent = "Save";

    }

});
