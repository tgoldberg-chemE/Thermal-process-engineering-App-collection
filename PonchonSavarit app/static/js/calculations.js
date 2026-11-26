
 // ==================================================
 // ENTHALPY CALCULATION
 // ==================================================

async function calculateEnthalpy() {

    if (!vleData) {
        throw new Error("Please calculate VLE first.");
    }

    const response = await fetch(`${APP_ROOT}/calculate-enthalpy`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            vle_data: vleData
        })

    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data.error || "Enthalpy calculation failed."
        );
    }

    enthalpyData = data;

    return data;
}


// ==================================================
// APPLY CURRENT HXY SCALE MODE
// ==================================================



function isValidAxisRange(range) {
    return (
        Array.isArray(range) &&
        range.length === 2 &&
        range.every(value => Number.isFinite(Number(value))) &&
        Number(range[0]) !== Number(range[1])
    );
}


// ==================================================
// APPLY CURRENT HXY SCALE MODE
// ==================================================



async function resetHxyScaleAfterCalculation(saveReference = false) {

    await selectDiagram(0);

    await new Promise(resolve =>
        requestAnimationFrame(() =>
            requestAnimationFrame(resolve)
        )
    );

    const graph = document.getElementById("demoChart");

    if (!graph || !graph.data || !graph._fullLayout) {
        console.error("HXY Plotly-Diagramm nicht verfügbar.");
        return;
    }

    // --------------------------------------------------
    // SAVE NEW VLE REFERENCE
    // Only after a new VLE calculation
    // --------------------------------------------------

    if (saveReference) {

        await Plotly.relayout(graph, {
            "xaxis.autorange": true,
            "yaxis.autorange": true
        });

        await new Promise(resolve =>
            requestAnimationFrame(() =>
                requestAnimationFrame(resolve)
            )
        );

        const xRange = graph._fullLayout?.xaxis?.range;
        const yRange = graph._fullLayout?.yaxis?.range;

        if (
            isValidAxisRange(xRange) &&
            isValidAxisRange(yRange)
        ) {

            hxyVleXRange = [...xRange];
            hxyVleYRange = [...yRange];

            console.log("NEW VLE REFERENCE:", {
                x: hxyVleXRange,
                y: hxyVleYRange
            });

        } else {

            console.warn("Invalid VLE reference ranges.");

        }

        // After every new VLE calculation,
        // switch to AUTO mode.
        hxyScaleMode = "auto";
    }

    // --------------------------------------------------
    // APPLY CURRENT SCALE MODE
    // --------------------------------------------------

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

    // Update zoom limits using the applied ranges
    await updateInitialAxisRanges(graph);

    updateHxyScaleSwitch();

    console.log("HXY scale mode after calculation:", hxyScaleMode);
}



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
            "error"
        );

        setMainStatus(
            "VLE input error – invalid pressure",
            "error"
        );

        return;
    }

    // Clear previous information
    clearInformation("vle");
    clearInformation("stages");

    setMessage(
        "vleMessage",
        "Calculating VLE...",
        "info"
    );

    setMainStatus("VLE calculation in progress...", "info");

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

        enthalpyData = null;

        // Clear previous stage data
        stageData = null;
        stageHistory = [];

        resultsSaved = false;

        // Calculate enthalpy
        try {

            await calculateEnthalpy();

        } catch (error) {

            enthalpyData = null;

            console.error(
                "Enthalpy calculation error:",
                error
            );

        }

        // --------------------------------------------------
        // RESET PREVIOUS STAGE CALCULATION
        // --------------------------------------------------

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

        // --------------------------------------------------
        // SAVE NEW VLE SCALE AND APPLY CURRENT MODE
        // --------------------------------------------------

        await resetHxyScaleAfterCalculation(true);

        // --------------------------------------------------
        // STATUS MESSAGE – VLE
        // --------------------------------------------------

        const vleHasWarnings =
            Array.isArray(data.warnings) &&
            data.warnings.length > 0;

        const vleStatus = vleHasWarnings
            ? "warning"
            : "success";

        setMessage(
            "vleMessage",
            data.warning || "VLE calculated!",
            vleStatus
        );

        setMainStatus(
            vleHasWarnings
                ? "VLE completed with warnings"
                : "VLE calculated successfully",
            vleStatus
        );

        // Store VLE information
        setInformation("vle", {

            title: "VLE Calculation",

            paragraphs: [
                data.more_message ||
                "VLE calculation completed successfully."
            ]

        });

        console.log("VLE data:", vleData);

        // Debug VLLE data
        const hasVLLE =
            Array.isArray(vleData.x_vlle) &&
            vleData.x_vlle.length >= 2 &&
            Number.isFinite(Number(vleData.y_vlle));

        console.log("VLLE data after VLE calculation:", {
            hasVLLE: hasVLLE,
            x_vlle: vleData.x_vlle ?? null,
            y_vlle: vleData.y_vlle ?? null,
            t_vlle: vleData.t_vlle ?? null,
            vleData: vleData
        });

    } catch (error) {

        vleData = null;
        stageData = null;
        enthalpyData = null;

        hxyVleXRange = null;
        hxyVleYRange = null;

        clearInformation("vle");
        clearInformation("stages");

        setMessage(
            "vleMessage",
            "Error: " + error.message,
            "error"
        );

        setMainStatus(
            "VLE calculation failed",
            "error"
        );

        await selectDiagram(0);

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

    // Read caloric factors
    const caloricA = Number($("caloricA").value);
    const caloricF = Number($("caloricF").value);
    const caloricE = Number($("caloricE").value);

    // Array order: bottom, feed, head
    const q = [
        caloricA,
        caloricF,
        caloricE
    ];

    // ==================================================
    // CHECK VLE DATA
    // ==================================================

    if (!vleData) {

        setMessage(
            "stageMessage",
            "Please calculate VLE first.",
            "error"
        );

        setMainStatus(
            "Stage calculation unavailable – VLE missing",
            "warning"
        );

        return;
    }

    // ==================================================
    // CHECK NUMERIC INPUTS
    // ==================================================

    if (
        ![
            z,
            xd,
            xb,
            reflux,
            caloricA,
            caloricF,
            caloricE
        ].every(Number.isFinite)
    ) {

        setMessage(
            "stageMessage",
            "Please enter valid numeric inputs.",
            "error"
        );

        setMainStatus(
    "Stage calculation input error",
    "error"
);

        return;
    }

    // ==================================================
    // CHECK COMPOSITION LIMITS
    // ==================================================

    if (!(0 < xb && xb < z && z < xd && xd < 1)) {

        setMessage(
            "stageMessage",
            "Expected: 0 < xB < zF < xD < 1.",
            "error"
        );

        setMainStatus(
    "Stage calculation input error",
    "error"
);

        return;
    }

    // ==================================================
    // CHECK REFLUX FACTOR
    // ==================================================

    if (reflux < 1) {

        setMessage(
            "stageMessage",
            "The reflux factor must be at least 1.",
            "error"
        );

        setMainStatus(
    "Stage calculation input error",
    "error"
);

        return;
    }

    // ==================================================
    // CHECK CALORIC FACTOR LIMITS
    // ==================================================

    if (
        caloricA < 0.7 || caloricA > 1.0 ||
        caloricF < -0.2 || caloricF > 1.1 ||
        caloricE < 1.0 || caloricE > 1.1
    ) {

        setMessage(
            "stageMessage",
            "Caloric factor limits: qA = 0.7–1.0, qF = -0.2–1.1, qE = 1.0–1.1.",
            "error"
        );

        setMainStatus(
    "Stage calculation input error",
    "error"
);

        return;
    }

    // ==================================================
    // VLLE CHECK – BEFORE STAGE CALCULATION
    // ==================================================

    if ($("mixture").value === "water-1-butanol") {

        const vlleLiquid = vleData.x_vlle;
        const vlleVapor = Number(vleData.y_vlle);

        if (
            Array.isArray(vlleLiquid) &&
            vlleLiquid.length >= 2 &&
            Number.isFinite(Number(vlleLiquid[0])) &&
            Number.isFinite(Number(vlleLiquid[1])) &&
            Number.isFinite(vlleVapor)
        ) {

            const xVLLE1 = Number(vlleLiquid[0]);
            const xVLLE2 = Number(vlleLiquid[1]);

            const vlleMin = Math.min(
                xVLLE1,
                xVLLE2,
                vlleVapor
            );

            const vlleMax = Math.max(
                xVLLE1,
                xVLLE2,
                vlleVapor
            );

            const feedInsideVLLE =
                z >= vlleMin - 1e-8 &&
                z <= vlleMax + 1e-8;

            if (feedInsideVLLE) {

                // Stop calculation
                stageData = null;
                stageHistory = [];
                resultsSaved = false;

                // Reset output fields
                $("totalStages").value = "–";
                $("minReflux").value = "–";
                $("actualReflux").value = "–";
                $("relativeVolatility").value = "–";

                $("upperStages").textContent = "–";
                $("lowerStages").textContent = "–";
                $("qC").textContent = "–";
                $("qB").textContent = "–";

                $("feedTemperature").textContent = "–";
                $("topTemperature").textContent = "–";
                $("bottomTemperature").textContent = "–";

                // Display detailed information
                setInformation("stages", {

                    title: "VLLE Feed Composition",

                    paragraphs: [
                        "The global feed composition lies inside the VLLE composition interval of the water–1-butanol system.",

                        "At this composition, vapor-liquid-liquid equilibrium can occur. The feed is therefore within the heterogeneous three-phase equilibrium region.",

                        "The conventional Ponchon-Savarit stage calculation is not performed under this condition."
                    ],

                    warnings: [
                        {
                            type: "warning",
                            title: "Feed composition",
                            message: `Feed composition zF = ${z.toFixed(4)}`
                        },
                        {
                            type: "warning",
                            title: "VLLE composition interval",
                            message: `VLLE composition interval = ${vlleMin.toFixed(4)} – ${vlleMax.toFixed(4)}`
                        },
                        {
                            type: "warning",
                            title: "Stage calculation stopped",
                            message: "No theoretical separation stages were calculated.",
                            recommendation: "Choose a feed composition outside the VLLE region."
                        }
                    ],

                });

                // Show results and information view
                setDisplayView("results");

                setMessage(
                    "stageMessage",
                    "Stage calculation stopped: Feed composition lies inside the VLLE region.",
                    "warning"
                );
                setMainStatus(
                    "Stage calculation stopped – VLLE region",
                    "warning"
                );

                // Return to Diagram 1 using AUTO scale
                hxyScaleMode = "auto";
                updateHxyScaleSwitch();

                await resetHxyScaleAfterCalculation(false);

                return;
            }
        }
    }

    // ==================================================
    // ONLY IF VLLE CHECK PASSES:
    // CALCULATE SEPARATION STAGES
    // ==================================================
        setMessage(
        "stageMessage",
        "Calculating separation stages...",
        "info"
    );

    setMainStatus(
        "Stage calculation in progress...",
        "info"
    );

    hxyScaleMode = "auto";
    updateHxyScaleSwitch();
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

        // Display temperatures (all values in Kelvin)
        $("feedTemperature").textContent =
            `${Number(data.temperature_feed).toFixed(1)} K`;

        $("topTemperature").textContent =
            `${Number(
                data.temperature_head_saturated ??
                data.temperature_distillate_saturated
            ).toFixed(1)} K`;

        $("bottomTemperature").textContent =
            `${Number(data.temperature_bottom).toFixed(1)} K`;

        // Display energy values (kJ/mol)
        $("qC").textContent =
            data.q_C == null
                ? "–"
                : (-Math.abs(Number(data.q_C))).toFixed(3);

        $("qB").textContent =
            data.q_B == null
                ? "–"
                : Number(data.q_B).toFixed(3);

        resultsSaved = false;

        // Add calculation to history
        calculationHistory.push({

            mixture: $("mixture").selectedOptions[0].textContent,

            pressure: Number($("pressure").value),

            feed: z,
            distillate: xd,
            bottom: xb,

            reflux: reflux,

            qA: caloricA,
            qF: caloricF,
            qE: caloricE,

            temperature_bottom: data.temperature_bottom,
            temperature_feed: data.temperature_feed,
            temperature_distillate: data.temperature_distillate,

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

        // Store detailed stage information
        setInformation("stages", {

            title: "Stage Construction",

            paragraphs: [
                data.more_message
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

        });

        // --------------------------------------------------
        // STATUS MESSAGE – STAGE CALCULATION
        // --------------------------------------------------

        const stageHasWarnings =
            Array.isArray(data.warnings) &&
            data.warnings.length > 0;

        const stageStatus = stageHasWarnings
            ? "warning"
            : "success";

        setMessage(
            "stageMessage",
            data.warning || "Separation stages calculated!",
            stageStatus
        );

        setMainStatus(
            stageHasWarnings
                ? "Stage calculation completed with warnings"
                : "Stage calculation successful",
            stageStatus
        );

        // Return to Diagram 1 and preserve current scale mode
        await resetHxyScaleAfterCalculation(false);

    } catch (error) {

        stageData = null;

        clearInformation("stages");

        setMessage(
            "stageMessage",
            "Error: " + error.message,
            "error"
        );

        setMainStatus(
            "Stage calculation failed",
            "error"
        );

        // Return to Diagram 1 and preserve current scale mode
        await resetHxyScaleAfterCalculation(false);

        console.error(
            "Stage calculation error:",
            error
        );

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

    // Mark results as saved
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
            "error"
        );

        setMainStatus(
            "Export unavailable – VLE missing",
            "warning"
        );

        return;
    }

    if (!stageData) {

        setMessage(
            "generalMessage",
            "Please calculate stages first.",
            true
        );

                setMainStatus(
            "Export unavailable – stages missing",
            "warning"
        );

        return;
    }

    setMessage(
        "generalMessage",
        "Preparing Excel file...",
        "info"
    );

    setMainStatus(
        "Preparing Excel export...",
        "info"
    );

    try {

        await saveResults();

        setMessage(
            "generalMessage",
            "Excel file successfully saved!",
            "success"
        );

        setMainStatus(
            "Results exported successfully",
            "success"
        );

    } catch (error) {

        console.error("Save error:", error);

        setMessage(
            "generalMessage",
            "Save failed: " + error.message,
            "error"
        );

        setMainStatus(
            "Excel export failed",
            "error"
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

        $("caloricA").value = "1.00";
        $("caloricF").value = "1.00";
        $("caloricE").value = "1.00";

        // Reset caloric sliders to their default positions
        $("caloricA-slider").value = "1.00";
        $("caloricF-slider").value = "1.00";
        $("caloricE-slider").value = "1.00";

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
        enthalpyData = null;

        stageHistory = [];
        calculationHistory = [];

        resultsSaved = false;

        // Reset saved HXY scales
        hxyVleXRange = null;
        hxyVleYRange = null;

        hxyScaleMode = "auto";

        // 5. Clear all information
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

        $("diagramPosition").textContent =
            `Position 1 of ${diagramInfo.length}`;

        $("diagramSelection").textContent =
            selected.label;

        $("diagramTitle").textContent =
            selected.title;

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

        // Update HXY scale switch
        updateHxyScaleSwitch();

        // 10. Update pressure options
        await updatePressureOptions();

        // 11. Update diagram and variable preview
        await selectDiagram(0);

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

        setMainStatus(
            "Ready – all data reset",
            "info"
        );

    } catch (error) {

        console.error("Reset error:", error);

        setMessage(
            "generalMessage",
            "Reset failed: " + error.message,
            "error"
        );

        setMainStatus(
            "Reset failed",
            "error"
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

    if (!confirmReset) {
        return;
    }

    await performReset();

});


// ==================================================
// HELP AND MANUAL
// ==================================================

$("manualButton").addEventListener("click", () => {

    setMessage(
        "generalMessage",
        "The user manual has been saved as a pdf on your local drive.",
        "info"
    );

    setMainStatus(
        "User manual information",
        "info"
    );
});


// ==================================================
// INITIAL SETUP
// ==================================================
setMainStatus("Ready", "success");

updateVariablePreview();

updatePressureOptions();

renderResultsTable();

setDisplayView("variables");

selectDiagram(0);
