import math

R = 8.314


def activity_coefficients(x1, temperature, parameters):
    """
    NRTL-Aktivitätskoeffizienten.

    temperature wird hier wie in der MATLAB-Vorlage
    direkt in °C verwendet, um deren Berechnung nachzubilden.
    """
    x2 = 1.0 - x1

    tau_12 = parameters["g12_g22"] / (R * temperature)
    tau_21 = parameters["g21_g11"] / (R * temperature)

    alpha = parameters["alpha"]

    G12 = math.exp(-alpha * tau_12)
    G21 = math.exp(-alpha * tau_21)

    denominator_1 = x2 + x1 * G12
    denominator_2 = x1 + x2 * G21

    ln_gamma_1 = x2**2 * (
        tau_12 * G12 / denominator_1**2
        + tau_21 * G21**2 / denominator_2**2
    )

    ln_gamma_2 = x1**2 * (
        tau_12 * G12**2 / denominator_1**2
        + tau_21 * G21 / denominator_2**2
    )

    return math.exp(ln_gamma_1), math.exp(ln_gamma_2)