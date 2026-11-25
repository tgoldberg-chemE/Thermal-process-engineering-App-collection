
import math
import numpy as np

from mccabe_calculation.antoine import (
    saturation_pressure,
    boiling_temperature
)

from mccabe_calculation.nrtl import activity_coefficients
from mccabe_calculation.parameters import get_parameters
from mccabe_calculation.lle_vlle import calculate_lle_vlle


# ==================================================
# TEMPERATURE CONVERSION
# ==================================================

def celsius_to_kelvin(temperature):
    """Convert Celsius to Kelvin."""

    if temperature is None:
        return None

    return float(temperature) + 273.15


# ==================================================
# VLE CALCULATION
# ==================================================

def calculate_vle(mixture, pressure, number_of_points=500):
    """
    Calculate vapor-liquid equilibrium (VLE).

    x: Liquid-phase composition of the first component.
    y: Vapor-phase composition of the first component.
    T: Equilibrium temperature in °C.

    Pressure input: bar
    Antoine pressure: mmHg

    For Water-1-Butanol, VLLE and LLE calculations
    are additionally performed.

    All returned temperatures are converted to Kelvin.
    """

    # --------------------------------------------------
    # 1. INPUT VALIDATION
    # --------------------------------------------------

    if not isinstance(mixture, str) or not mixture.strip():
        raise ValueError("Please select a valid mixture.")

    try:
        pressure = float(pressure)
    except (TypeError, ValueError):
        raise ValueError("Pressure must be a valid number.")

    if not math.isfinite(pressure) or pressure <= 0:
        raise ValueError("Pressure must be positive.")

    if (
        not isinstance(number_of_points, int)
        or number_of_points < 2
    ):
        raise ValueError(
            "The number of calculation points must be at least 2."
        )

    mixture_key = mixture.strip().lower()

    # --------------------------------------------------
    # 2. PRESSURE CONVERSION
    # --------------------------------------------------

    # Convert pressure from bar to mmHg.
    p = pressure * 760 / 1.013

    # --------------------------------------------------
    # 3. LOAD PARAMETERS
    # --------------------------------------------------

    parameters = get_parameters(
        mixture_key,
        pressure
    )

    a1 = parameters["a_e"]
    b1 = parameters["b_e"]
    c1 = parameters["c_e"]

    a2 = parameters["a_w"]
    b2 = parameters["b_w"]
    c2 = parameters["c_w"]

    # --------------------------------------------------
    # 4. INITIAL TEMPERATURE
    # --------------------------------------------------

    T_start = boiling_temperature(
        a2,
        b2,
        c2,
        p
    )

    # Liquid composition of the first component.
    x_values = np.linspace(
        0.0,
        1.0,
        number_of_points
    )

    temperatures = []
    vapor_compositions = []

    T_it = float(T_start)

    # --------------------------------------------------
    # 5. VLE CALCULATION USING NEWTON METHOD
    # --------------------------------------------------

    for x in x_values:

        converged = False

        for iteration in range(500):

            psat_1 = saturation_pressure(
                a1, b1, c1, T_it
            )

            psat_2 = saturation_pressure(
                a2, b2, c2, T_it
            )

            gamma_1, gamma_2 = activity_coefficients(
                x,
                T_it,
                parameters
            )

            # Bubble-point equilibrium equation.
            f = (
                p
                - x * gamma_1 * psat_1
                - (1.0 - x) * gamma_2 * psat_2
            )

            # Derivatives of Antoine equations.
            dpsat_1 = (
                psat_1
                * math.log(10)
                * b1
                / (c1 + T_it) ** 2
            )

            dpsat_2 = (
                psat_2
                * math.log(10)
                * b2
                / (c2 + T_it) ** 2
            )

            df = (
                -x * gamma_1 * dpsat_1
                - (1.0 - x) * gamma_2 * dpsat_2
            )

            if abs(df) < 1e-14:
                raise ArithmeticError(
                    f"Newton method: derivative too small "
                    f"at x={x:.4f}."
                )

            delta_T = f / df
            T_new = T_it - delta_T

            if (
                not math.isfinite(T_new)
                or T_new <= -c1
                or T_new <= -c2
            ):
                raise ArithmeticError(
                    f"Invalid temperature at x={x:.4f}."
                )

            T_it = T_new

            # Evaluate residual at updated temperature.
            psat_1_new = saturation_pressure(
                a1, b1, c1, T_it
            )

            psat_2_new = saturation_pressure(
                a2, b2, c2, T_it
            )

            gamma_1_new, gamma_2_new = activity_coefficients(
                x,
                T_it,
                parameters
            )

            f_new = (
                p
                - x * gamma_1_new * psat_1_new
                - (1.0 - x) * gamma_2_new * psat_2_new
            )

            if abs(f_new) < 1e-9:
                converged = True
                break

        if not converged:
            raise ArithmeticError(
                f"Newton method did not converge "
                f"at x={x:.4f}."
            )

        # Recalculate activity coefficients at converged T.
        gamma_1, gamma_2 = activity_coefficients(
            x,
            T_it,
            parameters
        )

        psat_1 = saturation_pressure(
            a1,
            b1,
            c1,
            T_it
        )

        # Vapor composition of the first component.
        y = x * gamma_1 * psat_1 / p

        temperatures.append(float(T_it))
        vapor_compositions.append(float(y))

    # Set final vapor composition exactly to 1.
    vapor_compositions[-1] = 1.0

    x_values = x_values.tolist()

    # --------------------------------------------------
    # 6. VLLE AND LLE: WATER-1-BUTANOL
    # --------------------------------------------------

    vlle_data = None
    lle_data = None

    x_vlle = None
    y_vlle = None
    t_vlle = None

    if mixture_key == "water-1-butanol":

        special_data = calculate_lle_vlle(
            pressure=pressure,
            params=parameters
        )

        x_vlle = np.asarray(
            special_data["x_vlle"],
            dtype=float
        ).tolist()

        y_vlle = float(special_data["y_vlle"])
        t_vlle = float(special_data["t_vlle"])

        # Validate VLLE results.
        if (
            len(x_vlle) != 2
            or not all(
                math.isfinite(value)
                for value in x_vlle
            )
            or not math.isfinite(y_vlle)
            or not math.isfinite(t_vlle)
        ):
            raise ValueError(
                "Invalid VLLE results for Water-1-Butanol."
            )

        if (
            not all(0.0 <= value <= 1.0 for value in x_vlle)
            or not 0.0 <= y_vlle <= 1.0
            or x_vlle[0] == x_vlle[1]
        ):
            raise ValueError(
                "VLLE compositions are outside the valid range."
            )

        # Ensure that the liquid compositions are ordered
        # from the lower to the higher composition.
        x_vlle.sort()

        # Replace VLE values inside the miscibility gap.
        lower_x = x_vlle[0]
        upper_x = x_vlle[1]

        for i, x in enumerate(x_values):

            if lower_x <= x <= upper_x:

                vapor_compositions[i] = y_vlle
                temperatures[i] = t_vlle

        # Store VLLE data.
        vlle_data = {
            "x": x_vlle,
            "y": y_vlle,
            "temperature": t_vlle
        }

        # Store LLE data.
        lle_data = {
            "x": special_data["x_lle"],
            "temperature": special_data["t_lle"]
        }

    # --------------------------------------------------
    # 7. AZEOTROPE CALCULATION
    # --------------------------------------------------

    y_modified = vapor_compositions.copy()

    # Modify endpoints to avoid numerical problems.
    y_modified[-1] = 1.1
    y_modified[0] = 0.001

    distances = [
        abs(y_modified[i] - x_values[i])
        for i in range(len(x_values))
    ]

    azeotrope_index = int(
        np.argmin(distances)
    )

    # --------------------------------------------------
    # 7A. HETEROGENEOUS AZEOTROPE
    # --------------------------------------------------

    if mixture_key == "water-1-butanol":

        azeotrope = {
            "exists": True,

            # Two coexisting liquid-phase compositions.
            "liquid_compositions": [
                float(x_vlle[0]),
                float(x_vlle[1])
            ],

            # Common vapor-phase composition.
            "y": float(y_vlle),

            # VLLE temperature in Celsius.
            "temperature": float(t_vlle)
        }

    # --------------------------------------------------
    # 7B. HOMOGENEOUS AZEOTROPE
    # --------------------------------------------------

    elif min(
        y_modified[i] - x_values[i]
        for i in range(len(x_values))
    ) <= 0:

        azeotrope = {
            "exists": True,

            "x": float(
                x_values[azeotrope_index]
            ),

            "y": float(
                vapor_compositions[azeotrope_index]
            ),

            "temperature": float(
                temperatures[azeotrope_index]
            )
        }

    # --------------------------------------------------
    # 7C. NO AZEOTROPE
    # --------------------------------------------------

    else:

        azeotrope = {
            "exists": False,
            "x": None,
            "y": None,
            "temperature": None
        }

    # --------------------------------------------------
    # 8. INFORMATION MESSAGES
    # --------------------------------------------------

    warning = "VLE calculated!"

    if mixture_key == "water-1-butanol":

        more_message = (
            "The mixture forms a heterogeneous azeotrope. "
            f"The azeotropic vapor composition is "
            f"y = {azeotrope['y']:.3f}. "
            f"The two coexisting liquid phases have "
            f"compositions xL1 = {x_vlle[0]:.3f} "
            f"and xL2 = {x_vlle[1]:.3f}."
        )

    elif azeotrope["exists"]:

        more_message = (
            "The mixture forms a homogeneous azeotrope. "
            f"The azeotropic composition is "
            f"x = {azeotrope['x']:.3f}."
        )

    else:

        more_message = (
            "The mixture does not form an azeotrope."
        )

    # --------------------------------------------------
    # 9. CONVERT TEMPERATURES TO KELVIN
    # --------------------------------------------------

    temperatures_kelvin = [
        celsius_to_kelvin(t)
        for t in temperatures
    ]

    azeotrope_kelvin = {
        **azeotrope,
        "temperature": celsius_to_kelvin(
            azeotrope["temperature"]
        )
    }

    if vlle_data is not None:

        vlle_data = {
            **vlle_data,
            "temperature": celsius_to_kelvin(
                vlle_data["temperature"]
            )
        }

    if lle_data is not None:

        lle_data = {
            **lle_data,
            "temperature": [
                celsius_to_kelvin(t)
                for t in lle_data["temperature"]
            ]
        }

    # --------------------------------------------------
    # 10. RETURN RESULTS
    # --------------------------------------------------

    return {
        "mixture": mixture,
        "pressure": float(pressure),

        "x": x_values,
        "y": vapor_compositions,
        "temperature": temperatures_kelvin,

        "azeotrope": azeotrope_kelvin,

        "vlle": vlle_data,
        "lle": lle_data,

        "warning": warning,
        "more_message": more_message
    }
