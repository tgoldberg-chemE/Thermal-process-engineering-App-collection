
"""
Ponchon-Savarit stage construction.

Inputs:
    vle_data: output of calculate_vle()
    feed: feed liquid composition
    distillate: distillate composition
    bottom: bottoms composition
    reflux_factor: multiplier of minimum reflux ratio
    q: [caloricA, caloricF, caloricE]

Internal enthalpy unit: J/mol
Output enthalpy duties: kJ/mol

Temperature conventions:
    - VLE input temperatures: K
    - Enthalpy functions: °C
    - Internal stage temperatures: °C
    - Top-level process temperatures: K
    - equilibrium_stage_temperature: K
"""

import math

import numpy as np
from scipy.optimize import brentq

from ponchon_calculation.enthalpy_parameters import get_enthalpy_parameters
from ponchon_calculation.enthalpy import (
    calculate_liquid_enthalpy,
    calculate_vapor_enthalpy,
    heatcap_L,
    heatcap_G,
    latheat,
)

_EPS = 1e-9
_MAX_STAGES = 500


def _as_float(value, name):
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"'{name}' must be a number.")

    if not math.isfinite(result):
        raise ValueError(f"'{name}' must be finite.")

    return result


def _root_on_grid(function, lower, upper, points=500):
    """Find the first root in a scanned interval."""
    lower = float(lower)
    upper = float(upper)

    if lower >= upper:
        raise ValueError(
            f"Invalid root interval [{lower:.6g}, {upper:.6g}]."
        )

    grid = np.linspace(lower, upper, points)

    previous_x = None
    previous_y = None

    for x_value in grid:
        try:
            y_value = float(function(float(x_value)))
        except (
            ValueError,
            ArithmeticError,
            FloatingPointError,
            OverflowError,
        ):
            previous_x = None
            previous_y = None
            continue

        if not math.isfinite(y_value):
            previous_x = None
            previous_y = None
            continue

        if abs(y_value) < 1e-10:
            return float(x_value)

        if previous_y is not None and previous_y * y_value < 0:
            return float(
                brentq(
                    function,
                    previous_x,
                    float(x_value),
                )
            )

        previous_x = float(x_value)
        previous_y = y_value

    raise ValueError(
        f"No root found in interval [{lower:.6g}, {upper:.6g}]."
    )


def _prepare_vle(vle_data):
    """
    Prepare the homogeneous VLE curve.

    The VLE API must provide temperatures in Kelvin.
    If vle_original exists, it is used instead of the VLLE-modified
    top-level VLE arrays.
    """
    source = vle_data.get("vle_original", vle_data)

    x = np.asarray(source.get("x", []), dtype=float)
    y = np.asarray(source.get("y", []), dtype=float)
    temperature = np.asarray(
        source.get("temperature", []),
        dtype=float,
    )

    if not (x.size == y.size == temperature.size):
        raise ValueError(
            "VLE x, y and temperature arrays must have equal length."
        )

    valid = (
        np.isfinite(x)
        & np.isfinite(y)
        & np.isfinite(temperature)
        & (x >= 0.0)
        & (x <= 1.0)
        & (y >= 0.0)
        & (y <= 1.0)
    )

    x = x[valid]
    y = y[valid]
    temperature = temperature[valid]

    if x.size < 3:
        raise ValueError("At least three valid VLE points are required.")

    order = np.argsort(x)
    x = x[order]
    y = y[order]
    temperature = temperature[order]

    unique_x, indices = np.unique(x, return_index=True)
    x = unique_x
    y = y[indices]
    temperature = temperature[indices]

    if x.size < 3:
        raise ValueError(
            "VLE data contains too few unique liquid compositions."
        )

    # VLE API temperature: Kelvin.
    # Enthalpy functions: Celsius.
    temperature = temperature - 273.15

    return x, y, temperature


def _temperature_to_celsius(value):
    """Convert API temperatures to Celsius if they are in Kelvin."""
    value = float(value)
    return value - 273.15 if value > 200.0 else value


def _get_lle_data(vle_data):
    """
    Read the two LLE binodal branches.

    Supported formats:
        vle_data["lle"]["x"] = [branch_1, branch_2]
        vle_data["lle"]["temperature"] = [...]

    Also supports the original calculate_lle_vlle keys:
        x_lle and t_lle

    Temperatures are returned in Celsius. The two branches are sorted
    at each temperature so that x1 <= x2.
    """
    lle = vle_data.get("lle", {})

    if not isinstance(lle, dict):
        lle = {}

    x_values = lle.get("x", vle_data.get("x_lle"))
    temperatures = lle.get(
        "temperature",
        vle_data.get("t_lle"),
    )

    if x_values is None or temperatures is None:
        return None

    try:
        x_values = np.asarray(x_values, dtype=float)
        temperatures = np.asarray(
            temperatures,
            dtype=float,
        ).flatten()

        if x_values.ndim != 2:
            return None

        # Expected shape: (2, number_of_temperatures).
        if x_values.shape[0] == 2:
            branch1 = x_values[0]
            branch2 = x_values[1]

        # Also support (number_of_temperatures, 2).
        elif x_values.shape[1] == 2:
            branch1 = x_values[:, 0]
            branch2 = x_values[:, 1]

        else:
            return None

        if not (
            len(branch1)
            == len(branch2)
            == len(temperatures)
        ):
            return None

        valid = (
            np.isfinite(branch1)
            & np.isfinite(branch2)
            & np.isfinite(temperatures)
            & (branch1 >= 0.0)
            & (branch1 <= 1.0)
            & (branch2 >= 0.0)
            & (branch2 <= 1.0)
        )

        branch1 = branch1[valid]
        branch2 = branch2[valid]
        temperatures = temperatures[valid]

        if len(temperatures) < 2:
            return None

        temperatures = np.array([
            _temperature_to_celsius(t)
            for t in temperatures
        ])

        order = np.argsort(temperatures)
        temperatures = temperatures[order]
        branch1 = branch1[order]
        branch2 = branch2[order]

        # Remove duplicate temperatures before interpolation.
        unique_temperatures, indices = np.unique(
            temperatures,
            return_index=True,
        )
        temperatures = unique_temperatures
        branch1 = branch1[indices]
        branch2 = branch2[indices]

        if len(temperatures) < 2:
            return None

        x1 = np.minimum(branch1, branch2)
        x2 = np.maximum(branch1, branch2)

        return {
            "temperature": temperatures,
            "x1": x1,
            "x2": x2,
        }

    except (TypeError, ValueError, IndexError):
        return None


def _line_value(x_value, point1, point2):
    """Calculate enthalpy on the line between two points."""
    x1, h1 = point1
    x2, h2 = point2

    if abs(x2 - x1) < _EPS:
        raise ValueError("Operating line is vertical.")

    return h1 + (h2 - h1) * (x_value - x1) / (x2 - x1)


def _find_curve_intersection(
    curve,
    point1,
    point2,
    lower,
    upper,
):
    """Find intersection of a curve and a straight line."""

    def residual(value):
        return curve(value) - _line_value(value, point1, point2)

    return _root_on_grid(residual, lower, upper)


def _stage_intersection(
    curve,
    point1,
    point2,
    lower,
    upper,
):
    return _find_curve_intersection(
        curve,
        point1,
        point2,
        lower,
        upper,
    )


def _add_warning(
    warnings,
    status_messages,
    title,
    message,
    recommendation,
    status,
):
    """
    Add a detailed warning and its corresponding short status message.

    warnings:
        Detailed warnings for the question-mark information panel.

    status_messages:
        Short messages for the small status field.
    """

    warnings.append({
        "type": "warning",
        "title": title,
        "message": message,
        "recommendation": recommendation,
    })

    if status and status not in status_messages:
        status_messages.append(status)

def calculate_stages(
    vle_data,
    feed,
    distillate,
    bottom,
    reflux_factor,
    q,
):
    """
    Calculate Ponchon-Savarit stages.

    q:
        q[0] = caloricA (bottom)
        q[1] = caloricF (feed)
        q[2] = caloricE (distillate)

    LLE handling:
        Only the distillate caloric state is checked for LLE.
        For q[2] > 1, the temperature-dependent LLE tie line is
        used if the distillate composition lies between the two
        binodal branches at the calculated temperature.

        Bottom and feed calculations remain unchanged.
    """

    # --------------------------------------------------
    # 1. Input validation
    # --------------------------------------------------

    if not isinstance(vle_data, dict):
        raise ValueError("VLE data must be a dictionary.")

    feed = _as_float(feed, "feed")
    distillate = _as_float(distillate, "distillate")
    bottom = _as_float(bottom, "bottom")
    reflux_factor = _as_float(reflux_factor, "reflux")

    if not (0.0 <= bottom < feed < distillate <= 1.0):
        raise ValueError(
            "Compositions must satisfy "
            "0 <= bottom < feed < distillate <= 1."
        )

    if reflux_factor < 0.0:
        raise ValueError(
            "The reflux factor must be greater than or equal to zero."
        )

    if not isinstance(q, (list, tuple, np.ndarray)) or len(q) != 3:
        raise ValueError(
            "q must contain three caloric factors: "
            "[caloricA, caloricF, caloricE]."
        )

    caloric_bottom = _as_float(q[0], "q[0]")
    caloric_feed = _as_float(q[1], "q[1]")
    caloric_distillate = _as_float(q[2], "q[2]")

    x, y, T = _prepare_vle(vle_data)

    mixture = vle_data.get("mixture")
    if not mixture:
        raise ValueError("Mixture name is missing from VLE data.")

    pressure = _as_float(vle_data.get("pressure"), "pressure")

    params = get_enthalpy_parameters(mixture, pressure)

    warnings = []
    status_messages = []

    if bottom < x[0] or distillate > x[-1]:
        raise ValueError(
            "The requested compositions are outside the available VLE range."
        )

    # --------------------------------------------------
    # 1a. VLLE LIMIT
    # --------------------------------------------------

    vlle = vle_data.get("vlle")

    if vlle is not None:
        try:
            y_vlle = _as_float(vlle["y"], "VLLE vapour composition")
        except (KeyError, TypeError):
            raise ValueError("Invalid VLLE data.")

        if distillate >= y_vlle:
            raise ValueError(
                "The distillate cannot exceed the heterogeneous "
                "azeotropic vapor composition "
                f"xD = {y_vlle:.3f}."
            )

    # --------------------------------------------------
    # 1b. AZEOTROPE LIMIT
    # --------------------------------------------------

    azeo = vle_data.get("azeotrope") or {}

    if vlle is None:
        if (
            azeo.get("exists")
            and azeo.get("x") is not None
        ):
            x_azeo = _as_float(
                azeo["x"],
                "azeotropic composition"
            )

            if any(
                composition > x_azeo + 1e-6
                for composition in (bottom, feed, distillate)
            ):
                raise ValueError(
                    "Bottom, feed and distillate compositions "
                    "must not exceed the azeotropic vapor composition "
                    f"(x_azeotrope = {x_azeo:.3f})."
                )

    y_lower = max(float(np.min(y)), 0.0)
    y_upper = min(float(np.max(y)), 1.0)

    # --------------------------------------------------
    # 2. VLE interpolation functions
    # --------------------------------------------------

    hL_data = np.array([
        calculate_liquid_enthalpy(float(xi), float(Ti), params)
        for xi, Ti in zip(x, T)
    ], dtype=float)

    hV_data = np.array([
        calculate_vapor_enthalpy(float(yi), float(Ti), pressure, params)
        for yi, Ti in zip(y, T)
    ], dtype=float)

    vapor_order = np.argsort(y)
    y_vapor = y[vapor_order]
    hV_vapor = hV_data[vapor_order]
    T_vapor_data = T[vapor_order]

    y_vapor, vapor_indices = np.unique(y_vapor, return_index=True)
    hV_vapor = hV_vapor[vapor_indices]
    T_vapor_data = T_vapor_data[vapor_indices]

    def y_eq(x_value):
        return float(np.interp(x_value, x, y))

    def bubble_temperature(x_value):
        return float(np.interp(x_value, x, T))

    def liquid_h(x_value):
        return float(np.interp(x_value, x, hL_data))

    def vapor_h(y_value):
        if y_value < y_vapor[0] or y_value > y_vapor[-1]:
            raise ValueError(
                f"Vapor composition {y_value:.6g} is outside the VLE range."
            )
        return float(np.interp(y_value, y_vapor, hV_vapor))

    def vapor_temperature(y_value):
        if y_value < y_vapor[0] or y_value > y_vapor[-1]:
            raise ValueError(
                f"Vapor composition {y_value:.6g} is outside the VLE range."
            )
        return float(np.interp(y_value, y_vapor, T_vapor_data))

    def inverse_vle(y_value):
        """Find the first liquid-side VLE root for a vapor composition."""
        differences = y - y_value
        candidates = []

        for i in range(len(x) - 1):
            if abs(differences[i]) < 1e-10:
                candidates.append(float(x[i]))
            elif differences[i] * differences[i + 1] < 0:
                candidates.append(float(brentq(
                    lambda z_value: y_eq(z_value) - y_value,
                    float(x[i]),
                    float(x[i + 1]),
                )))

        if abs(differences[-1]) < 1e-10:
            candidates.append(float(x[-1]))

        if not candidates:
            raise ValueError(
                "VLE inverse could not find a liquid composition "
                f"for y={y_value:.6g}."
            )

        x_value = candidates[0]
        return x_value, liquid_h(x_value), bubble_temperature(x_value)



    # --------------------------------------------------
    # 3. LLE tie-line and liquid enthalpy functions
    # --------------------------------------------------

    lle_data = _get_lle_data(vle_data)

    def lle_tie_line_at_temperature(temp):
        """
        Return x1 and x2 from the two LLE binodal branches at temp.

        No extrapolation is performed outside the supplied LLE
        temperature range.
        """
        if lle_data is None:
            return None

        temperatures = lle_data["temperature"]

        if (
            temp < temperatures[0] - 1e-8
            or temp > temperatures[-1] + 1e-8
        ):
            return None

        x1 = float(np.interp(
            temp,
            temperatures,
            lle_data["x1"],
        ))
        x2 = float(np.interp(
            temp,
            temperatures,
            lle_data["x2"],
        ))

        if x2 - x1 <= _EPS:
            return None

        return x1, x2

    def liquid_state_enthalpy(composition, temp, use_lle):
        """
        Liquid enthalpy at a given temperature.

        If use_lle is True and the overall composition lies between
        the two LLE binodal branches at this temperature, the liquid
        is represented by the lever-rule mixture of the two liquid
        phases. Otherwise the original homogeneous-liquid enthalpy
        model is used.
        """
        z = float(composition)

        if use_lle:
            tie_line = lle_tie_line_at_temperature(float(temp))

            if tie_line is not None:
                x1, x2 = tie_line

                if x1 - _EPS <= z <= x2 + _EPS:
                    phase1_fraction = (x2 - z) / (x2 - x1)
                    phase2_fraction = 1.0 - phase1_fraction

                    h1 = calculate_liquid_enthalpy(
                        x1,
                        float(temp),
                        params,
                    )
                    h2 = calculate_liquid_enthalpy(
                        x2,
                        float(temp),
                        params,
                    )

                    return float(
                        phase1_fraction * h1
                        + phase2_fraction * h2
                    )

        return float(
            calculate_liquid_enthalpy(
                z,
                float(temp),
                params,
            )
        )

    # --------------------------------------------------
    # 4. Caloric state calculation
    # --------------------------------------------------

    def state_enthalpy(
        composition,
        caloric_factor,
        use_lle=False,
    ):
        """
        Calculate the enthalpy state corresponding to a caloric factor.

        Returns:
            enthalpy [J/mol]
            liquid composition
            temperature [°C]

        use_lle is enabled only for the distillate state.
        Bottom and feed retain the original calculation.
        """
        z = _as_float(composition, "composition")
        q_value = _as_float(caloric_factor, "caloric factor")

        if not 0.0 <= z <= 1.0:
            raise ValueError("Composition must be between 0 and 1.")

        T_bubble = bubble_temperature(z)

        hL_initial = liquid_h(z)

        x_dew, _, T_dew = inverse_vle(z)
        hV_initial = vapor_h(z)

        # Saturated liquid: q = 1.
        if abs(q_value - 1.0) < _EPS:
            return hL_initial, z, T_bubble

        # Subcooled liquid: q > 1.
        if q_value > 1.0:
            h_target = (
                hV_initial
                - q_value * (hV_initial - hL_initial)
            )

            def residual(temp):
                h_liquid = liquid_state_enthalpy(
                    z,
                    temp,
                    use_lle=use_lle,
                )
                return float(h_liquid - h_target)

            temp = _root_on_grid(
                residual,
                -20.0,
                T_bubble,
                points=700,
            )

            return h_target, z, temp

        # Saturated vapor: q = 0.
        if abs(q_value) < _EPS:
            return hV_initial, x_dew, T_dew

        # Superheated vapor: q < 0.
        if q_value < 0.0:
            h_sat = hV_initial

            h_target = (
                h_sat
                - q_value * (h_sat - hL_initial)
            )

            def residual(temp):
                cp_wG, cp_eG = heatcap_G(
                    temp,
                    pressure,
                    params,
                )

                hLV_w, hLV_e = latheat(T_dew, params)
                cp_wL, cp_eL = heatcap_L(T_dew, params)

                h_reference = (
                    z * (cp_eL * T_dew + hLV_e)
                    + (1.0 - z) * (cp_wL * T_dew + hLV_w)
                )

                h_current = (
                    h_reference
                    + z * cp_eG * (temp - T_dew)
                    + (1.0 - z) * cp_wG * (temp - T_dew)
                )

                return float(h_current - h_target)

            temp = _root_on_grid(
                residual,
                T_dew,
                400.0,
                points=500,
            )

            return h_target, x_dew, temp

        # Two-phase mixture: 0 < q < 1.
        h_target = hV_initial - q_value * (hV_initial - hL_initial)

        def tie_line_residual(x_liquid):
            y_equ = y_eq(x_liquid)
            delta = y_equ - x_liquid

            if abs(delta) < 1e-10:
                raise ArithmeticError(
                    "Tie-line is undefined near an azeotropic/pinch point."
                )

            hL_equ = liquid_h(x_liquid)
            hV_equ = vapor_h(y_equ)
            h_tie = (
                hL_equ
                + (hV_equ - hL_equ) / delta * (z - x_liquid)
            )
            return h_target - h_tie

        x_grid = np.linspace(
            max(float(x[0]), 1e-8),
            z - 1e-8,
            1000,
        )
        valid = []

        for x_liquid in x_grid:
            y_equ = y_eq(float(x_liquid))

            if not (x_liquid < z < y_equ):
                continue

            try:
                f_value = tie_line_residual(float(x_liquid))
            except (
                ValueError,
                ArithmeticError,
                FloatingPointError,
            ):
                continue

            if math.isfinite(f_value):
                valid.append((float(x_liquid), float(f_value)))

        bracket = None
        x_liquid = None

        for (x1, f1), (x2, f2) in zip(valid[:-1], valid[1:]):
            if abs(f1) < 1e-7:
                x_liquid = x1
                break

            if f1 * f2 < 0:
                bracket = (x1, x2)
                break

        if x_liquid is None:
            if bracket is not None:
                x_liquid = float(
                    brentq(
                        tie_line_residual,
                        *bracket,
                        xtol=1e-10,
                    )
                )
            elif valid and abs(valid[-1][1]) < 1e-7:
                x_liquid = valid[-1][0]
            else:
                raise ValueError(
                    "No physically valid tie-line root found for the "
                    "two-phase state. Check q, composition and VLE data."
                )

        T_final = bubble_temperature(x_liquid)
        return h_target, x_liquid, T_final

    # --------------------------------------------------
    # 5. Feed, bottom and distillate caloric states
    # --------------------------------------------------

    # Bottom and feed calculations remain unchanged.
    h_A, x_A_liquid, T_A = state_enthalpy(
        bottom,
        caloric_bottom,
        use_lle=False,
    )

    h_F, x_F_liquid, T_F = state_enthalpy(
        feed,
        caloric_feed,
        use_lle=False,
    )

    # Only the distillate is checked for LLE.
    # For q[2] > 1, the LLE tie line is used only if the
    # distillate composition lies inside the binodal interval.
    h_E, x_E_liquid, T_E = state_enthalpy(
        distillate,
        caloric_distillate,
        use_lle=True,
    )

    h_AL = liquid_h(x_A_liquid)

    # --------------------------------------------------
    # 6. Feed tie-line and minimum reflux
    # --------------------------------------------------

    def feed_tie_line_residual(x_value):
        y_value = y_eq(x_value)

        if abs(y_value - x_value) < _EPS:
            return np.nan

        h_l = liquid_h(x_value)

        h_v = float(
            calculate_vapor_enthalpy(
                y_value,
                bubble_temperature(x_value),
                pressure,
                params,
            )
        )

        slope = (h_v - h_l) / (y_value - x_value)
        X_value = (h_F + slope * x_value - h_l) / slope

        return feed - X_value

    X_F = _root_on_grid(
        feed_tie_line_residual,
        max(float(x[0]), 0.0001),
        min(float(x[-1]), 0.9999),
        points=700,
    )

    y_F = y_eq(X_F)
    hL_F = liquid_h(X_F)

    hV_F = float(
        calculate_vapor_enthalpy(
            y_F,
            bubble_temperature(X_F),
            pressure,
            params,
        )
    )

    if abs(y_F - X_F) < _EPS:
        raise ValueError(
            "Feed tie-line is undefined near the azeotropic composition."
        )

    m_F = (hV_F - hL_F) / (y_F - X_F)

    h_S = m_F * bottom - m_F * X_F + hL_F
    h_D = m_F * distillate - m_F * X_F + hL_F

    x_D_dew, _, T_D_sat = inverse_vle(distillate)
    h_V_D = vapor_h(distillate)

    if h_S > h_A:
        denominator = feed - bottom

        if abs(denominator) < _EPS:
            raise ValueError(
                "Feed and bottoms compositions are too close."
            )

        h_D = (
            (h_F - h_A)
            / denominator
            * (distillate - feed)
            + h_F
        )

    q_C = h_D - h_E
    q_R_min = h_D - h_V_D

    denominator = h_V_D - h_E

    if abs(denominator) < _EPS:
        raise ValueError(
            "Minimum reflux ratio cannot be calculated: "
            "distillate enthalpy difference is zero."
        )

    r_min = q_R_min / denominator

    if r_min < 0:
        _add_warning(
            warnings,
            status_messages,
            title="Negative minimum reflux ratio",
            message=(
                f"The calculated minimum reflux ratio is negative "
                f"(RLmin = {r_min:.3f})."
            ),
            recommendation=(
                "Check the caloric factors and feed conditions. "
                "Adjust the operating conditions and recalculate."
            ),
            status="Physically infeasible minimum reflux ratio!",
        )
        

    actual_reflux = reflux_factor * r_min

    # --------------------------------------------------
    # 7. Initial result structure
    # --------------------------------------------------

    result_base = {
        "mixture": mixture,
        "pressure": pressure,
        "feed": feed,
        "distillate": distillate,
        "bottom": bottom,

        "q": [
            caloric_bottom,
            caloric_feed,
            caloric_distillate,
        ],

        "warning": (
            " | ".join(status_messages)
            if status_messages
            else "Separation stages calculated!"
        ),

        "more_message": "",

        # Top-level temperatures in Kelvin.
        "temperature_bottom": T_A + 273.15,
        "temperature_feed": T_F + 273.15,
        "temperature_distillate": T_E + 273.15,
        "temperature_distillate_saturated": T_D_sat + 273.15,

        "minimum_reflux": r_min,
        "actual_reflux": actual_reflux,

        "q_B": None,
        "q_C": q_C / 1000.0,

        "total_stages": None,
        "rectifying_stages": None,
        "stripping_stages": None,
        "relative_volatility": None,

        "equilibrium_stage_x": [],
        "equilibrium_stage_y": [],
        "equilibrium_stage_temperature": [],

        "rectifying_stages_data": [],
        "stripping_stages_data": [],

        "warnings": warnings,
    }

    # --------------------------------------------------
    # 8. Relative volatility at the feed
    # --------------------------------------------------

    feed_index = int(np.argmin(np.abs(x - feed)))

    x_near = float(x[feed_index])
    y_near = float(y[feed_index])

    if 0.0 < x_near < 1.0 and 0.0 < y_near < 1.0:
        k1 = y_near / x_near
        k2 = (1.0 - y_near) / (1.0 - x_near)

        alpha_feed = k1 / k2 if abs(k2) > _EPS else None
    else:
        alpha_feed = None

    result_base["relative_volatility"] = alpha_feed

    # --------------------------------------------------
    # 9. Check invalid minimum reflux result
    # --------------------------------------------------

    if r_min < 0:
        result_base["warning"] = " | ".join(status_messages)

        return result_base

    # --------------------------------------------------
    # 10. Operating difference points and reboiler duty
    # --------------------------------------------------

    q_R = actual_reflux * (h_V_D - h_E)
    h_D = h_V_D + q_R

    h_S = (
        (h_D - h_F)
        / (distillate - feed)
        * (bottom - feed)
        + h_F
    )

    q_B = abs(h_A) - h_S

    result_base["q_B"] = q_B / 1000.0
    result_base["q_C"] = (h_D - h_E) / 1000.0
    result_base["actual_reflux"] = actual_reflux

    D = (distillate, h_D)
    S = (bottom, h_S)

    # --------------------------------------------------
    # 11. Diagram points and main lines
    # --------------------------------------------------

    result_base.update({
        "process_points": {
            "feed": {
                "x": feed,
                "h": h_F / 1000.0,
                "temperature": T_F,
            },
            "bottom": {
                "x": bottom,
                "h": h_A / 1000.0,
                "temperature": T_A,
            },
            "distillate": {
                "x": distillate,
                "h": h_E / 1000.0,
                "temperature": T_E,
                "temperature_saturated": T_D_sat,
            },
        },
        "difference_points": {
            "S": {
                "x": bottom,
                "h": h_S / 1000.0,
            },
            "D": {
                "x": distillate,
                "h": h_D / 1000.0,
            },
        },
        "operating_points": {
            "D": {
                "x": distillate,
                "h": h_D / 1000.0,
            },
            "S": {
                "x": bottom,
                "h": h_S / 1000.0,
            },
        },
        "rectifying_line": {
            "x": [distillate, feed],
            "h": [h_D / 1000.0, h_F / 1000.0],
        },
        "stripping_line": {
            "x": [bottom, feed],
            "h": [h_S / 1000.0, h_F / 1000.0],
        },
    })

    # --------------------------------------------------
    # 12. Abort if reflux is below or at minimum reflux
    # --------------------------------------------------

    if reflux_factor < 1.0:
        _add_warning(
            warnings,
            status_messages,
            title="Reflux factor below minimum",
            message=(
                f"The reflux factor is below 1.0 "
                f"(factor = {reflux_factor:.4f}). "
                "Continuous separation with the requested "
                "specification is not feasible."
            ),
            recommendation=(
                "Increase the reflux factor to at least 1.0."
            ),
            status="Reflux factor below minimum.",
        )

        result_base["warning"] = " ".join(status_messages)

        return result_base

    if abs(reflux_factor - 1.0) < _EPS:
        _add_warning(
            warnings,
            status_messages,
            title="Minimum reflux condition",
            message=(
                "At minimum reflux, the theoretical number "
                "of stages approaches infinity."
            ),
            recommendation=(
                "Increase the reflux factor above 1.0 "
                "to obtain a finite number of theoretical stages."
            ),
            status="Minimum reflux condition!",
        )

        result_base.update({
            "warning": " ".join(status_messages),
            "total_stages": None,
            "rectifying_stages": None,
            "stripping_stages": None,
            "stage_limit_reached": True,
        })

        return result_base

    # --------------------------------------------------
    # 13. Limiting vapor composition
    # --------------------------------------------------

    y_lim = _stage_intersection(
        vapor_h,
        S,
        D,
        y_lower,
        y_upper,
    )

    # --------------------------------------------------
    # 14. Stripping section
    # --------------------------------------------------

    z_s = [float(x_A_liquid)]
    h_s = [float(h_AL)]
    T_s = []

    stripping_data = []
    stripping_stages = 0

    for _ in range(_MAX_STAGES):

        if stripping_stages == 0:
            current_check = z_s[0]
        else:
            current_check = z_s[-3]

        if current_check >= y_lim:
            break

        current_x = float(z_s[-1])

        current_y = y_eq(current_x)
        current_hv = vapor_h(current_y)
        current_Tv = bubble_temperature(current_x)

        z_s.append(float(current_y))
        h_s.append(float(current_hv))
        T_s.append(float(current_Tv))

        stripping_data.append({
            "x": current_x,
            "y": float(current_y),
            "temperature": float(current_Tv),
            "h_liquid": liquid_h(current_x) / 1000.0,
            "h_vapor": current_hv / 1000.0,
        })

        z_s.append(float(bottom))
        h_s.append(float(h_S))

        x_next = _stage_intersection(
            liquid_h,
            (current_y, current_hv),
            S,
            max(float(x[0]), 0.0),
            min(float(x[-1]), 1.0),
        )

        z_s.append(float(x_next))
        h_s.append(float(liquid_h(x_next)))

        stripping_stages += 1

    else:
        _add_warning(
            warnings,
            status_messages,
            title="Stripping construction limit reached",
            message=(
                f"The stripping construction reached the "
                f"iteration limit of {_MAX_STAGES} stages."
            ),
            recommendation=(
                "Check the operating conditions and the "
                "stripping operating line."
            ),
            status="Stripping stage calculation limit reached.",
        )

    # Add only the final liquid-side intersection with the boiling line.
    if stripping_stages > 0:
        x_final = float(z_s[-1])

        if (
            not stripping_data
            or abs(stripping_data[-1]["x"] - x_final) > 1e-10
        ):
            y_final = float(y_eq(x_final))
            T_final = float(bubble_temperature(x_final))

            stripping_data.append({
                "x": x_final,
                "y": y_final,
                "temperature": T_final,
                "h_liquid": liquid_h(x_final) / 1000.0,
                "h_vapor": vapor_h(y_final) / 1000.0,
            })

    # --------------------------------------------------
    # 15. Rectifying section
    # --------------------------------------------------

    z_e = [float(distillate)]
    h_e = [float(h_V_D)]
    T_e = [float(T_E)]

    rectifying_data = []
    rectifying_stages = 0

    current_y = float(distillate)
    last_x = float(distillate)

    for _ in range(_MAX_STAGES):

        if last_x <= z_s[-1]:
            break

        try:
            x_current, h_current, T_current = inverse_vle(current_y)

            z_e.append(float(x_current))
            h_e.append(float(h_current))
            T_e.append(float(T_current))

            rectifying_data.append({
                "x": float(x_current),
                "y": float(current_y),
                "temperature": float(T_current),
                "h_liquid": float(h_current) / 1000.0,
                "h_vapor": vapor_h(current_y) / 1000.0,
            })

            z_e.append(float(distillate))
            h_e.append(float(h_D))

            y_next = _stage_intersection(
                vapor_h,
                (x_current, h_current),
                D,
                y_lower,
                y_upper,
            )

            h_next = vapor_h(y_next)

            z_e.append(float(y_next))
            h_e.append(float(h_next))

        except (ValueError, ArithmeticError) as error:
            _add_warning(
                warnings,
                status_messages,
                title="Enriching stage construction stopped",
                message=(
                    f"The enriching stage construction stopped: {str(error)}"
                ),
                recommendation=(
                    "Check the VLE range and the operating-line intersections."
                ),
                status="Enriching stage construction stopped.",
            )
            break

        rectifying_stages += 1
        current_y = float(y_next)
        last_x = float(x_current)

    else:
        _add_warning(
            warnings,
            status_messages,
            title="Enriching construction limit reached",
            message=(
                f"The enriching stage construction reached the "
                f"calculation limit of {_MAX_STAGES} stages."
            ),
            recommendation="Check the operating conditions.",
            status="Enriching stage calculation limit reached.",
        )

    # --------------------------------------------------
    # 15a. Saturated head temperature
    # --------------------------------------------------

    # The head vapor composition is the distillate composition.
    # Determine the bubble temperature at this same composition.
    T_head_saturated = bubble_temperature(distillate)

    result_base["x_head_saturated"] = float(distillate)
    result_base["temperature_head_saturated"] = (
        float(T_head_saturated) + 273.15
    )

    # --------------------------------------------------
    # 16. Stage counts
    # --------------------------------------------------

    n_rectifying = rectifying_stages
    n_stripping = stripping_stages
    n_total = n_rectifying + n_stripping

    if 100 < n_total < _MAX_STAGES:
        _add_warning(
            warnings,
            status_messages,
            title="High number of theoretical stages",
            message=(
                f"The calculation resulted in {n_total} theoretical stages."
            ),
            recommendation=(
                "Review the reflux ratio factor, product specifications "
                "and operating conditions."
            ),
            status=f"High number of theoretical stages: {n_total}.",
        )

    # Physical column order: bottom -> top
    all_stages = (
        stripping_data
        + list(reversed(rectifying_data))
    )

    # --------------------------------------------------
    # 17. Final result
    # --------------------------------------------------

    result_base.update({
        "total_stages": n_total,
        "rectifying_stages": n_rectifying,
        "stripping_stages": n_stripping,

        "rectifying_stages_data": rectifying_data,
        "stripping_stages_data": stripping_data,

        "equilibrium_stage_x": [
            stage["x"] for stage in all_stages
        ],

        "equilibrium_stage_y": [
            stage["y"] for stage in all_stages
        ],

        # API output in Kelvin.
        "equilibrium_stage_temperature": [
            stage["temperature"] + 273.15
            for stage in all_stages
        ],

        "construction": {
            "stripping": {
                "z": z_s,
                "h": [value / 1000.0 for value in h_s],
                "temperature": T_s,
            },
            "rectifying": {
                "z": z_e,
                "h": [value / 1000.0 for value in h_e],
                "temperature": T_e,
            },
        },

        "process_points": {
            "feed": {
                "x": feed,
                "h": h_F / 1000.0,
                "temperature": T_F,
            },
            "bottom": {
                "x": bottom,
                "h": h_A / 1000.0,
                "temperature": T_A,
            },
            "distillate": {
                "x": distillate,
                "h": h_E / 1000.0,
                "temperature": T_E,
            },
        },

        "difference_points": {
            "S": {
                "x": bottom,
                "h": h_S / 1000.0,
            },
            "D": {
                "x": distillate,
                "h": h_D / 1000.0,
            },
        },

        "rectifying_line": {
            "x": [distillate, feed],
            "h": [
                h_D / 1000.0,
                h_F / 1000.0,
            ],
        },

        "stripping_line": {
            "x": [bottom, feed],
            "h": [
                h_S / 1000.0,
                h_F / 1000.0,
            ],
        },

        "operating_points": {
            "D": {
                "x": distillate,
                "h": h_D / 1000.0,
            },
            "S": {
                "x": bottom,
                "h": h_S / 1000.0,
            },
        },

        "stage_limit_reached": n_total >= _MAX_STAGES,
    })



    # --------------------------------------------------
    # 18. Final warning and status handling
    # --------------------------------------------------

    result_base["warnings"] = warnings

    result_base["warning"] = (
        " | ".join(status_messages)
        if status_messages
        else "Separation stages calculated!"
    )

    # General explanation if the stage construction
    # was completed successfully.
    construction_stopped = any(
        warning["title"] in (
            "Stripping construction limit reached",
            "Enriching stage construction stopped",
            "Enriching construction limit reached",
            "Maximum number of stages reached",
        )
        for warning in warnings
    )

    if (
        result_base["total_stages"] is not None
        and not construction_stopped
    ):
        result_base["more_message"] = (
            "The stripping section is constructed from the bottom "
            "upwards to the feed stage, while the enriching section "
            "is constructed from the distillate downwards to the "
            "feed stage. "
            "The total number of theoretical stages is the sum of "
            "the stages in the stripping and enriching sections."
        )

    return result_base
