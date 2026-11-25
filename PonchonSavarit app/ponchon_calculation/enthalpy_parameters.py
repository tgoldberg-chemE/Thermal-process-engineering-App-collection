"""
Thermodynamic parameters for the Ponchon-Savarit h-x,y calculation.

The nine parameter sets follow the MATLAB application's dr indexing:
0-2: ethanol-water; 3-5: methanol-water; 6-8: water-1-butanol.

For water-1-butanol, the MATLAB component convention is retained:
    e = water
    w = 1-butanol
Do not swap these arrays again.
"""

PARAMETERS = {
    "ethanol-water": {0.253: 0, 1.013: 1, 2.941: 2},
    "methanol-water": {0.467: 3, 1.013: 4, 5.066: 5},
    "water-1-butanol": {0.913: 6, 1.013: 7, 1.980: 8},
}

# Antoine and NRTL values are included for reference and for calculating
# the pure-component saturation reference temperature of heatcap_G.
ANTOINE = {
    "a_e": [8.11220, 8.11220, 7.58670, 8.08097, 8.08097, 7.97010, 8.07131, 8.07131, 8.01770],
    "a_w": [8.07131, 8.07131, 8.01770, 8.07131, 8.07131, 8.01770, 7.83800, 7.36366, 7.83800],
    "b_e": [1592.864, 1592.864, 1281.590, 1582.271, 1582.271, 1521.230, 1730.630, 1730.630, 1715.700],
    "b_w": [1730.630, 1730.630, 1715.700, 1730.630, 1730.630, 1715.700, 1558.190, 1305.198, 1558.190],
    "c_e": [226.184, 226.184, 193.768, 239.726, 239.726, 233.970, 233.426, 233.426, 234.268],
    "c_w": [233.426, 233.426, 234.268, 233.426, 233.426, 234.268, 196.881, 173.427, 196.881],
}

NRTL = {
    "g12_g22": [-75.2248, -105.7202, -254.2513, -260.7070, 484.6093, -159.1831, 2957.3304, 2794.6704, 2647.3507],
    "g21_g11": [1190.4830, 1384.2083, 1708.8319, 841.5625, 1478.4924, 765.4464, -58.0568, 570.1362, 384.4139],
    "alpha": [0.3028, 0.2976, 0.2865, 0.2995, 1.1158, 0.3016, 0.2856, 0.4700, 0.4056],
}

# Specific gas constants [J/(kg K)]
GAS_CONSTANTS = {
    "R_w": [461.526, 461.526, 461.526, 461.526, 461.526, 461.526, 112.173, 112.173, 112.173],
    "R_e": [180.481, 180.481, 180.481, 259.487, 259.487, 259.487, 461.526, 461.526, 461.526],
}

# Molar masses [kg/mol]
MOLAR_MASSES = {
    "M_w": [18.02, 18.02, 18.02, 18.02, 18.02, 18.02, 74.12, 74.12, 74.12],
    "M_e": [46.07, 46.07, 46.07, 32.04, 32.04, 32.04, 18.02, 18.02, 18.02],
}

# Critical temperatures [K]
CRITICAL_TEMPERATURES = {
    "Tc_w": [647.1, 647.1, 647.1, 647.1, 647.1, 647.1, 561.15, 561.15, 561.15],
    "Tc_e": [513.9, 513.9, 513.9, 513.38, 513.38, 513.38, 647.1, 647.1, 647.1],
}

# Gas heat-capacity correlation parameters
GAS_CP = {
    "A_eG": [1165.8648]*3 + [846.6321]*3 + [706.3032]*3,
    "A_wG": [706.3032]*6 + [492.3989]*3,
    "B_eG": [4.7021]*3 + [5.7309]*3 + [5.1703]*3,
    "B_wG": [5.1703]*6 + [18.1172]*3,
    "C_eG": [9.7786]*3 + [-4.8842]*3 + [-6.0865]*3,
    "C_wG": [-6.0865]*6 + [0.2036]*3,
    "D_eG": [-1.1769]*3 + [-12.8501]*3 + [-6.6011]*3,
    "D_wG": [-6.6011]*6 + [-41.5543]*3,
    "E_eG": [-135.7676]*3 + [78.9997]*3 + [36.2723]*3,
    "E_wG": [36.2723]*6 + [192.4340]*3,
    "F_eG": [322.7596]*3 + [-127.3725]*3 + [-63.0965]*3,
    "F_wG": [-63.0965]*6 + [-295.5686]*3,
    "G_eG": [-247.7349]*3 + [82.7107]*3 + [46.2085]*3,
    "G_wG": [46.2085]*6 + [175.0644]*3,
}

# Liquid heat-capacity correlation parameters
LIQUID_CP = {
    "A_eL": [0.5036]*3 + [0.5687]*3 + [0.2399]*3,
    "A_wL": [0.2399]*6 + [3.3654]*3,
    "B_eL": [22.4420]*3 + [14.1100]*3 + [12.8647]*3,
    "B_wL": [12.8647]*6 + [31.6732]*3,
    "C_eL": [-36.7832]*3 + [-11.9505]*3 + [-33.6392]*3,
    "C_wL": [-33.6392]*6 + [-30.7096]*3,
    "D_eL": [160.3732]*3 + [-23.4782]*3 + [104.7686]*3,
    "D_wL": [104.7686]*6 + [-46.5224]*3,
    "E_eL": [-466.4327]*3 + [57.5551]*3 + [-155.4709]*3,
    "E_wL": [-155.4709]*6 + [71.5993]*3,
    "F_eL": [396.0280]*3 + [-25.6027]*3 + [92.3726]*3,
    "F_wL": [92.3726]*6 + [-2.6518]*3,
}

# Latent heat of vaporization correlation parameters
LATENT_HEAT = {
    "A_eLV": [14.68765]*3 + [5.87513]*3 + [6.85307]*3,
    "A_wLV": [6.85307]*6 + [4.03015]*3,
    "B_eLV": [-15.27119]*3 + [13.91543]*3 + [7.43804]*3,
    "B_wLV": [7.43804]*6 + [18.33568]*3,
    "C_eLV": [26.062304]*3 + [-5.817880]*3 + [-2.937595]*3,
    "C_wLV": [-2.937595]*6 + [-4.805636]*3,
    "D_eLV": [-20.049661]*3 + [-5.692542]*3 + [-3.282093]*3,
    "D_wLV": [-3.282093]*6 + [-3.203926]*3,
    "E_eLV": [15.816495]*3 + [6.867206]*3 + [8.397378]*3,
    "E_wLV": [8.397378]*6 + [0.121902]*3,
}


def get_parameter_index(mixture, pressure):
    """Return MATLAB dr index for a mixture and pressure in bar."""
    if mixture not in PARAMETERS:
        raise ValueError(f"Unknown mixture: {mixture}")

    for allowed_pressure, index in PARAMETERS[mixture].items():
        if abs(float(pressure) - allowed_pressure) < 5e-4:
            return index

    allowed = ", ".join(f"{p:g}" for p in PARAMETERS[mixture])
    raise ValueError(
        f"Pressure {pressure} bar is not available for {mixture}. "
        f"Available pressures: {allowed} bar."
    )


def get_enthalpy_parameters(mixture, pressure):
    """Return a flat parameter dictionary for the selected condition."""
    index = get_parameter_index(mixture, pressure)
    groups = (
        ANTOINE, GAS_CONSTANTS, MOLAR_MASSES, CRITICAL_TEMPERATURES,
        GAS_CP, LIQUID_CP, LATENT_HEAT
    )
    result = {"index": index}
    for group in groups:
        result.update({name: values[index] for name, values in group.items()})

    # MATLAB uses M in kg/mol, hence convert the stored g/mol values.
    result["M_w"] *= 1e-3
    result["M_e"] *= 1e-3
    return result
