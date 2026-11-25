# Substance parameters from the MATLAB app
# Order:
# 1: Ethanol-Water, 0.253 bar
# 2: Ethanol-Water, 1.013 bar
# 3: Ethanol-Water, 2.941 bar
# 4: Methanol-Water, 0.467 bar
# 5: Methanol-Water, 1.013 bar
# 6: Methanol-Water, 5.066 bar
# 7: Water-1 Butanol, 0.913 bar
# 8: Water-1 Butanol, 1.013 bar
# 9: Water-1 Butanol, 1.980 bar

PARAMETERS = {
    "ethanol-water": {
        0.253: 0,
        1.013: 1,
        2.941: 2,
    },
    "methanol-water": {
        0.467: 3,
        1.013: 4,
        5.066: 5,
    },
    "water-1-butanol": {
        0.913: 6,
        1.013: 7,
        1.980: 8,
    },
}

ANTOINE = {
    "a_e": [
        8.11220, 8.11220, 7.58670,
        8.08097, 8.08097, 7.97010,
        8.07131, 8.07131, 8.01770
    ],
    "a_w": [
        8.07131, 8.07131, 8.01770,
        8.07131, 8.07131, 8.01770,
        7.83800, 7.36366, 7.83800
    ],
    "b_e": [
        1592.864, 1592.864, 1281.590,
        1582.271, 1582.271, 1521.230,
        1730.630, 1730.630, 1715.700
    ],
    "b_w": [
        1730.630, 1730.630, 1715.700,
        1730.630, 1730.630, 1715.700,
        1558.190, 1305.198, 1558.190
    ],
    "c_e": [
        226.184, 226.184, 193.768,
        239.726, 239.726, 233.970,
        233.426, 233.426, 234.268
    ],
    "c_w": [
        233.426, 233.426, 234.268,
        233.426, 233.426, 234.268,
        196.881, 173.427, 196.881
    ],
}

NRTL = {
    "g12_g22": [
        -75.2248, -105.7202, -254.2513,
        -260.7070, 484.6093, -159.1831,
        2957.3304, 2794.6704, 2647.3507
    ],
    "g21_g11": [
        1190.4830, 1384.2083, 1708.8319,
        841.5625, 1478.4924, 765.4464,
        -58.0568, 570.1362, 384.4139
    ],
    "alpha": [
        0.3028, 0.2976, 0.2865,
        0.2995, 1.1158, 0.3016,
        0.2856, 0.4700, 0.4056
    ],
}


def get_parameter_index(mixture, pressure):
    """Returns the parameter set for the selected mixture and pressure."""
    if mixture not in PARAMETERS:
        raise ValueError(f"Unknown mixture: {mixture}")

    for allowed_pressure, index in PARAMETERS[mixture].items():
        if abs(float(pressure) - allowed_pressure) < 0.0005:
            return index

    raise ValueError(
        f"Pressure {pressure} bar is not available for {mixture}."
    )


def get_parameters(mixture, pressure):
    """Returns all required constants for the selected parameter set."""
    index = get_parameter_index(mixture, pressure)

    result = {}

    for name, values in ANTOINE.items():
        result[name] = values[index]

    for name, values in NRTL.items():
        result[name] = values[index]

    return result