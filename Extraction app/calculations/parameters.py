
import numpy as np

ALPHA = 0.2

# Component order:
# 1 = Water
# 2 = Acetic Acid
# 3 = Ethyl Butanoate

A_M2 = np.array([
    [0.0,       667.85,  2119.8],
    [-614.53,   0.0,       36.245],
    [348.59,   -388.14,     0.0]
], dtype=float)


# M1: Die Komponentenreihenfolge muss noch
# anhand der MATLAB-Definition von A_M1 bestätigt werden.
A_M1 = np.array([
    [0.0,       489.20, 1318.8],
    [-301.51,   0.0,    377.45],
    [2557.3,    210.60, 0.0]
], dtype=float)


MIXTURES = {
    "acetone-water-toluene": A_M1,
    "acetic-acid-water-ethyl-butanoate": A_M2
}


def get_parameters(mixture):
    mixture = mixture.strip().lower()

    if mixture not in MIXTURES:
        raise ValueError(f"Unknown mixture: {mixture}")

    return MIXTURES[mixture], ALPHA
