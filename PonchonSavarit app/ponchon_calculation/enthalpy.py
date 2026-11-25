"""
Ponchon-Savarit enthalpy calculation.

Temperatures accepted from calculate_vle() are Kelvin. The MATLAB heat
capacity and latent-heat functions use Celsius, so conversion is performed
inside this module. Enthalpies are returned in kJ/mol.

For water-1-butanol, the supplied MATLAB parameter arrays define:
    component e = water
    component w = 1-butanol
This convention is retained exactly; no additional swapping is performed.
"""

import math
import numpy as np

from ponchon_calculation.enthalpy_parameters import get_enthalpy_parameters


def _finite_list(values):
    """Convert numpy values to JSON-safe Python floats (NaN/inf -> None)."""
    result = []
    for value in np.asarray(values, dtype=float).ravel():
        result.append(float(value) if np.isfinite(value) else None)
    return result


def _antoine_saturation_temperature(a, b, c, pressure_mmhg):
    """Antoine inverse: log10(P/mmHg) = a - b/(T[°C] + c)."""
    if pressure_mmhg <= 0:
        raise ValueError("Pressure must be positive.")
    denominator = a - math.log10(pressure_mmhg)
    if abs(denominator) < 1e-12:
        raise ValueError("Invalid Antoine parameters at selected pressure.")
    return b / denominator - c


def _pressure_to_mmhg(pressure_bar):
    # Same conversion convention as the existing VLE implementation.
    return float(pressure_bar) * 760.0 / 1.013


def heatcap_L(T_c, p):
    """
    MATLAB heatcap_L equivalent.

    Returns mean liquid heat capacities (cp_wL, cp_eL) in J/(mol K),
    integrated from 0 °C to T_c using Simpson's 1/6 weighting.
    """
    T_c = np.asarray(T_c, dtype=float)
    T_k = T_c + 273.15
    T_ref = 273.15
    T_mean = 0.5 * (T_k + T_ref)

    def cp_at(component, temperature_k):
        tr = temperature_k / p[f"Tc_{component}"]
        z = 1.0 - tr
        return (
            p[f"M_{component}"] * p[f"R_{component}"]
            * (
                p[f"A_{component}L"] / z
                + p[f"B_{component}L"]
                + p[f"C_{component}L"] * z
                + p[f"D_{component}L"] * z**2
                + p[f"E_{component}L"] * z**3
                + p[f"F_{component}L"] * z**4
            )
        )

    cp_w_ref = cp_at("w", T_ref)
    cp_e_ref = cp_at("e", T_ref)
    cp_w_mean = cp_at("w", T_mean)
    cp_e_mean = cp_at("e", T_mean)
    cp_w = cp_at("w", T_k)
    cp_e = cp_at("e", T_k)

    cp_wL = (cp_w_ref + 4.0 * cp_w_mean + cp_w) / 6.0
    cp_eL = (cp_e_ref + 4.0 * cp_e_mean + cp_e) / 6.0
    return cp_wL, cp_eL


def _gas_cp_component(T_k, component, p):
    """Pure-component gas Cp [J/(mol K)] at absolute temperature T_k."""
    A = p[f"A_{component}G"]
    B = p[f"B_{component}G"]
    C = p[f"C_{component}G"]
    D = p[f"D_{component}G"]
    E = p[f"E_{component}G"]
    F = p[f"F_{component}G"]
    G = p[f"G_{component}G"]

    tau = T_k / (A + T_k)
    return (
        p[f"M_{component}"] * p[f"R_{component}"]
        * (
            B + (C - B) * tau**2
            * (
                1.0 - A / (A + T_k)
                * (D + E * tau + F * tau**2 + G * tau**3)
            )
        )
    )


def heatcap_G(T_c, pressure_bar, p):
    """
    MATLAB heatcap_G equivalent.

    Returns (cp_wG, cp_eG), mean gas heat capacities in J/(mol K),
    referenced to the mean pure-component saturation temperature.
    """
    pressure_mmhg = _pressure_to_mmhg(pressure_bar)
    tsat_w = _antoine_saturation_temperature(
        p["a_w"], p["b_w"], p["c_w"], pressure_mmhg
    )
    tsat_e = _antoine_saturation_temperature(
        p["a_e"], p["b_e"], p["c_e"], pressure_mmhg
    )
    T_ref = 0.5 * (tsat_w + tsat_e) + 273.15

    T_k = np.asarray(T_c, dtype=float) + 273.15
    T_mean = 0.5 * (T_k + T_ref)

    cp_w_ref = _gas_cp_component(T_ref, "w", p)
    cp_e_ref = _gas_cp_component(T_ref, "e", p)
    cp_w_mean = _gas_cp_component(T_mean, "w", p)
    cp_e_mean = _gas_cp_component(T_mean, "e", p)
    cp_w = _gas_cp_component(T_k, "w", p)
    cp_e = _gas_cp_component(T_k, "e", p)

    return (
        (cp_w_ref + 4.0 * cp_w_mean + cp_w) / 6.0,
        (cp_e_ref + 4.0 * cp_e_mean + cp_e) / 6.0,
    )


def latheat(T_c, p):
    """MATLAB latheat equivalent; returns (hLV_w, hLV_e) in J/mol."""
    T_k = np.asarray(T_c, dtype=float) + 273.15

    def component_heat(component):
        tr = T_k / p[f"Tc_{component}"]
        z = 1.0 - tr
        # Fractional powers are only physically defined below Tc.
        z = np.maximum(z, 0.0)
        return (
            p[f"M_{component}"] * p[f"R_{component}"]
            * p[f"Tc_{component}"]
            * (
                p[f"A_{component}LV"] * z ** (1.0 / 3.0)
                + p[f"B_{component}LV"] * z ** (2.0 / 3.0)
                + p[f"C_{component}LV"] * z
                + p[f"D_{component}LV"] * z**2
                + p[f"E_{component}LV"] * z**6
            )
        )

    return component_heat("w"), component_heat("e")


def calculate_liquid_enthalpy(x, T_c, params):
    """Saturated liquid molar enthalpy hL [J/mol]."""
    cp_wL, cp_eL = heatcap_L(T_c, params)
    x = np.asarray(x, dtype=float)
    return (x * cp_eL + (1.0 - x) * cp_wL) * np.asarray(T_c, dtype=float)


def calculate_vapor_enthalpy(y, T_c, pressure, params):
    """
    Saturated vapor molar enthalpy hV [J/mol].

    As in the MATLAB app, saturated vapor enthalpy uses liquid Cp plus
    latent heat. Gas Cp is reserved for superheated-vapor isotherms.
    """
    cp_wL, cp_eL = heatcap_L(T_c, params)
    hLV_w, hLV_e = latheat(T_c, params)
    y = np.asarray(y, dtype=float)
    T_c = np.asarray(T_c, dtype=float)
    return (
        y * (cp_eL * T_c + hLV_e)
        + (1.0 - y) * (cp_wL * T_c + hLV_w)
    )


def _build_tie_lines(x, y, hL, hV, T):
    return [
        {
            "x": float(xi), "y": float(yi),
            "hL": float(hli / 1000.0), "hV": float(hvi / 1000.0),
            "temperature": float(ti),
        }
        for xi, yi, hli, hvi, ti in zip(x, y, hL, hV, T)
        if all(np.isfinite(v) for v in (xi, yi, hli, hvi, ti))
    ]


def _prepare_lle_data(lle):
    """
    Bereitet die LLE-Daten aus calculate_vle() auf.

    Erwartete Eingabe:
        lle["x"]: 2 x N
        lle["temperature"]: N Temperaturen in Kelvin

    Interne Ausgabe:
        x: 2 x N
        temperature: N Temperaturen in °C

    Die beiden Zusammensetzungszweige werden punktweise
    als untere und obere Binodale sortiert.
    """
    if not isinstance(lle, dict):
        return None

    if lle.get("x") is None or lle.get("temperature") is None:
        return None

    x_lle = np.asarray(lle["x"], dtype=float)
    T_lle = np.asarray(lle["temperature"], dtype=float).ravel()

    if x_lle.ndim != 2 or x_lle.shape[0] != 2:
        raise ValueError("LLE x-data must have shape (2, N).")

    if x_lle.shape[1] != len(T_lle):
        raise ValueError(
            "LLE composition and temperature arrays must have equal lengths."
        )

    # API liefert Kelvin, intern wird Celsius verwendet.
    T_lle = T_lle - 273.15

    valid = (
        np.isfinite(T_lle)
        & np.all(np.isfinite(x_lle), axis=0)
        & np.all((x_lle >= 0.0) & (x_lle <= 1.0), axis=0)
    )

    x_lle = x_lle[:, valid]
    T_lle = T_lle[valid]

    if len(T_lle) < 2:
        return None

    # Temperaturwerte aufsteigend sortieren.
    order = np.argsort(T_lle)
    T_lle = T_lle[order]
    x_lle = x_lle[:, order]

    # Untere und obere Binodale punktweise bestimmen.
    x_lower = np.minimum(x_lle[0], x_lle[1])
    x_upper = np.maximum(x_lle[0], x_lle[1])

    # Doppelte Temperaturwerte entfernen.
    T_unique, unique_indices = np.unique(
        T_lle,
        return_index=True
    )

    x_lower = x_lower[unique_indices]
    x_upper = x_upper[unique_indices]

    if len(T_unique) < 2:
        return None

    return {
        "temperature": T_unique,
        "x_lower": x_lower,
        "x_upper": x_upper,
    }


def get_lle_limits_at_temperature(T_iso_C, lle_data):
    """
    Interpoliert die beiden LLE-Binodalen bei T_iso_C.

    T_iso_C und lle_data["temperature"] sind in °C.

    Rückgabe:
        (x_alpha, x_beta)

    None, wenn keine LLE-Daten vorliegen oder die
    Temperatur außerhalb des berechneten LLE-Bereichs liegt.
    """
    if lle_data is None:
        return None

    T_lle = lle_data["temperature"]

    if (
        T_iso_C < T_lle[0]
        or T_iso_C > T_lle[-1]
    ):
        return None

    x_alpha = float(np.interp(
        T_iso_C,
        T_lle,
        lle_data["x_lower"]
    ))

    x_beta = float(np.interp(
        T_iso_C,
        T_lle,
        lle_data["x_upper"]
    ))

    if x_beta <= x_alpha:
        return None

    return x_alpha, x_beta

def _make_isotherms(
    x,
    y,
    T,
    pressure,
    params,
    lle=None,
    number=7
):
    """
    Erzeugt:
      - zwei unterkühlte Flüssigkeitsisothermen
      - ausgewählte Sättigungsisothermen
      - drei überhitzte Dampfisothermen

    Temperaturen intern in °C.
    Enthalpien in kJ/mol.

    Die unterkühlten Flüssigkeitsisothermen werden im
    LLE-Entmischungsbereich unterbrochen.
    """
    result = []

    if len(T) < 2:
        return result

    t_min = float(np.nanmin(T))
    t_max = float(np.nanmax(T))

    if not np.isfinite(t_min) or not np.isfinite(t_max):
        return result

    print(f"[Enthalpy] t_min = {t_min:.2f} °C")
    print(f"[Enthalpy] t_max = {t_max:.2f} °C")

    # --------------------------------------------------
    # 1. Unterkühlte Flüssigkeitsisothermen
    # --------------------------------------------------

    low_temps = [
        np.floor(t_min / 10.0) * 10.0 - 10.0,
        np.floor(t_min / 10.0) * 10.0 - 20.0,
    ]

    # Zusammensetzungsraster für glatte Isothermen.
    x_iso = np.linspace(0.0, 1.0, 200)

    for temp in low_temps:

        cp_wL, cp_eL = heatcap_L(temp, params)

        h_iso = (
            x_iso * cp_eL
            + (1.0 - x_iso) * cp_wL
        ) * temp / 1000.0

        # LLE-Grenzen bei der Temperatur dieser Isotherme.
        lle_limits = get_lle_limits_at_temperature(
            temp,
            lle
        )

        if lle_limits is not None:

            x_alpha, x_beta = lle_limits

            # Zusammensetzungen außerhalb des LLE-Gebiets.
            left_mask = x_iso <= x_alpha
            right_mask = x_iso >= x_beta

            x_left = x_iso[left_mask]
            x_right = x_iso[right_mask]

            h_left = h_iso[left_mask]
            h_right = h_iso[right_mask]

            # NaN erzeugt beim anschließenden JSON-sicheren
            # Umwandeln None. Plotly unterbricht dort die Linie.
            x_plot = np.concatenate([
                x_left,
                [np.nan],
                x_right
            ])

            h_plot = np.concatenate([
                h_left,
                [np.nan],
                h_right
            ])

            print(
                f"[Enthalpy] LLE gap at {temp:.1f} °C: "
                f"x = {x_alpha:.4f} to {x_beta:.4f}"
            )

        else:
            # Keine LLE-Unterbrechung bei dieser Temperatur.
            x_plot = x_iso
            h_plot = h_iso

        result.append({
            "type": "subcooled-liquid",
            "name": f"Unterkühlte Flüssigkeit {temp:.0f} °C",
            "x": _finite_list(x_plot),
            "h": _finite_list(h_plot),
            "temperature": float(temp),
        })

    # --------------------------------------------------
    # 2. Sättigungs-/VLE-Isothermen
    # --------------------------------------------------

    indices = np.linspace(
        0,
        len(T) - 1,
        min(number, len(T)),
        dtype=int
    )

    for idx in sorted(set(indices.tolist())):

        temp = float(T[idx])

        h_liq = (
            float(calculate_liquid_enthalpy(
                x[idx],
                temp,
                params
            )) / 1000.0
        )

        h_vap = (
            float(calculate_vapor_enthalpy(
                y[idx],
                temp,
                pressure,
                params
            )) / 1000.0
        )

        result.append({
            "type": "vle",
            "name": f"Sättigungsisotherme {temp:.1f} °C",
            "x": [float(x[idx]), float(y[idx])],
            "h": [h_liq, h_vap],
            "temperature": temp,
        })

    # --------------------------------------------------
    # 3. Überhitzte Dampfisothermen
    # --------------------------------------------------

    high_temps = [
        np.ceil(t_max / 10.0) * 10.0 + 10.0,
        np.ceil(t_max / 10.0) * 10.0 + 20.0,
        np.ceil(t_max / 10.0) * 10.0 + 30.0,
    ]

    for temp in high_temps:

        cp_wG, cp_eG = heatcap_G(
            temp,
            pressure,
            params
        )

        hLV_w, hLV_e = latheat(T, params)
        cp_wL, cp_eL = heatcap_L(T, params)

        h_sat = (
            y * (cp_eL * T + hLV_e)
            + (1.0 - y) * (cp_wL * T + hLV_w)
        )

        delta = temp - T

        h_super = (
            h_sat
            + y * cp_eG * delta
            + (1.0 - y) * cp_wG * delta
        )

        result.append({
            "type": "superheated-vapor",
            "name": f"Überhitzter Dampf {temp:.0f} °C",
            "x": _finite_list(y),
            "h": _finite_list(h_super / 1000.0),
            "temperature": float(temp),
        })

    return result

    """
    Generate representative subcooled-liquid, VLE and superheated-vapor
    isotherms. Each isotherm contains x/y composition and h [kJ/mol].
    """
    result = []
    if len(T) < 2:
        return result

    t_min = float(np.nanmin(T))
    t_max = float(np.nanmax(T))
    print(f"[Enthalpy] t_min = {t_min:.2f} °C")
    print(f"[Enthalpy] t_max = {t_max:.2f} °C")
    if not np.isfinite(t_min + t_max):
        return result

    # Exactly two subcooled-liquid isotherms
    # Close to the lower VLE temperature boundary.

    # Two subcooled-liquid isotherms:
    # Round down to the nearest 10 °C, then step down by 10 °C.
    low_temps = [
        (np.floor(t_min / 10.0) * 10.0) - 10.0,
        (np.floor(t_min / 10.0) * 10.0) - 20.0
    ]

    low_temps = [temp for temp in low_temps]

    for temp in low_temps:
        cp_wL, cp_eL = heatcap_L(temp, params)
        h = (x * cp_eL + (1.0 - x) * cp_wL) * temp / 1000.0
        result.append({
            "type": "subcooled-liquid",
            "name": f"Unterkühlte Flüssigkeit {temp:.0f} °C",
            "x": _finite_list(x), "h": _finite_list(h),
            "temperature": float(temp),
        })

    # Saturation/VLE isotherms: use actual equilibrium tie-line pairs.
    indices = np.linspace(0, len(T) - 1, min(number, len(T)), dtype=int)
    for idx in sorted(set(indices.tolist())):
        temp = float(T[idx])
        h_liq = float(calculate_liquid_enthalpy(x[idx], temp, params)) / 1000.0
        h_vap = float(calculate_vapor_enthalpy(y[idx], temp, pressure, params)) / 1000.0
        result.append({
            "type": "vle",
            "name": f"Sättigungsisotherme {temp:.1f} °C",
            "x": [float(x[idx]), float(y[idx])],
            "h": [h_liq, h_vap],
            "temperature": temp,
        })

    # Exactly three superheated-vapor isotherms
    # Close to the upper VLE temperature boundary.

    # Three superheated-vapor isotherms:
    # Round up to the nearest 10 °C, then step up by 10 °C.
    high_temps = [
        (np.ceil(t_max / 10.0) * 10.0) + 10.0,
        (np.ceil(t_max / 10.0) * 10.0) + 20.0,
        (np.ceil(t_max / 10.0) * 10.0) + 30.0
    ]

    high_temps = [temp for temp in high_temps]

    for temp in high_temps:
        cp_wG, cp_eG = heatcap_G(temp, pressure, params)
        hLV_w, hLV_e = latheat(T, params)
        cp_wL, cp_eL = heatcap_L(T, params)
        h_sat = y * (cp_eL * T + hLV_e) + (1.0 - y) * (cp_wL * T + hLV_w)
        delta = temp - T
        h_super = h_sat + y * cp_eG * delta + (1.0 - y) * cp_wG * delta
        result.append({
            "type": "superheated-vapor",
            "name": f"Überhitzter Dampf {temp:.0f} °C",
            "x": _finite_list(y), "h": _finite_list(h_super / 1000.0),
            "temperature": float(temp),
        })

    return result


def _safe_optional_array(data, key):
    value = data.get(key)
    if not isinstance(value, dict):
        return None
    return value


def calculate_enthalpy_diagram(vle_data):
    """
    Calculate h-x,y diagram data from calculate_vle() output.

    Input temperatures from calculate_vle(): Kelvin.
    Internal temperatures: °C.
    Output enthalpies: kJ/mol.
    Output temperatures: °C.
    """
    mixture = vle_data["mixture"]
    pressure = float(vle_data["pressure"])
    params = get_enthalpy_parameters(mixture, pressure)

    # --------------------------------------------------
    # 1. VLE-Daten einlesen und Kelvin -> Celsius
    # --------------------------------------------------

    T = np.asarray(
        vle_data["temperature"],
        dtype=float
    ) - 273.15

    x = np.asarray(vle_data["x"], dtype=float)
    y = np.asarray(vle_data["y"], dtype=float)

    if not (len(x) == len(y) == len(T)):
        raise ValueError(
            "VLE x, y and temperature arrays must have equal length."
        )

    if len(x) == 0:
        raise ValueError("VLE data contains no equilibrium points.")

    valid = (
        np.isfinite(x)
        & np.isfinite(y)
        & np.isfinite(T)
    )

    x = x[valid]
    y = y[valid]
    T = T[valid]

    # --------------------------------------------------
    # 2. LLE-Daten vor den Isothermen aufbereiten
    # --------------------------------------------------

    lle_raw = _safe_optional_array(vle_data, "lle")
    lle_prepared = _prepare_lle_data(lle_raw)

    # --------------------------------------------------
    # 3. Flüssigkeits- und Dampfenthalpien
    # --------------------------------------------------

    hL = calculate_liquid_enthalpy(
        x,
        T,
        params
    )

    hV = calculate_vapor_enthalpy(
        y,
        T,
        pressure,
        params
    )

    # --------------------------------------------------
    # 4. Azeotrop
    # --------------------------------------------------

    azeotrope_out = None
    azeotrope = vle_data.get("azeotrope")

    if isinstance(azeotrope, dict):

        ax = azeotrope.get("x")
        ay = azeotrope.get("y")
        at = azeotrope.get("temperature")

        if ax is not None and ay is not None and at is not None:

            at_c = float(at) - 273.15

            ahL = (
                float(calculate_liquid_enthalpy(
                    float(ax),
                    at_c,
                    params
                )) / 1000.0
            )

            ahV = (
                float(calculate_vapor_enthalpy(
                    float(ay),
                    at_c,
                    pressure,
                    params
                )) / 1000.0
            )

            azeotrope_out = {
                "x": float(ax),
                "y": float(ay),
                "h_liquid": ahL,
                "h_vapor": ahV,
                "temperature": at_c,
            }

    # --------------------------------------------------
    # 5. LLE-Enthalpien berechnen
    # --------------------------------------------------

    lle_out = None

    if lle_prepared is not None:

        lle_T = lle_prepared["temperature"]
        lle_x1 = lle_prepared["x_lower"]
        lle_x2 = lle_prepared["x_upper"]

        cp_wL, cp_eL = heatcap_L(
            lle_T,
            params
        )

        h_phase1 = (
            lle_x1 * cp_eL
            + (1.0 - lle_x1) * cp_wL
        ) * lle_T / 1000.0

        h_phase2 = (
            lle_x2 * cp_eL
            + (1.0 - lle_x2) * cp_wL
        ) * lle_T / 1000.0

        lle_out = {
            "x1": _finite_list(lle_x1),
            "x2": _finite_list(lle_x2),
            "h1": _finite_list(h_phase1),
            "h2": _finite_list(h_phase2),
            "temperature": _finite_list(lle_T),
        }

    # --------------------------------------------------
    # 6. VLLE-Enthalpien berechnen
    # --------------------------------------------------

    vlle_out = None
    vlle = _safe_optional_array(vle_data, "vlle")

    if vlle and vlle.get("x") is not None:

        vlle_x = np.asarray(
            vlle["x"],
            dtype=float
        )

        vlle_T_raw = vlle.get("temperature")

        if vlle_T_raw is not None:

            vlle_T = float(vlle_T_raw) - 273.15

            cp_wL, cp_eL = heatcap_L(
                vlle_T,
                params
            )

            h_liq = (
                vlle_x * cp_eL
                + (1.0 - vlle_x) * cp_wL
            ) * vlle_T / 1000.0

            vlle_y = float(vlle.get("y", np.nan))

            h_vap = (
                float(calculate_vapor_enthalpy(
                    vlle_y,
                    vlle_T,
                    pressure,
                    params
                )) / 1000.0
            )

            vlle_out = {
                "x": _finite_list(vlle_x),
                "y": vlle_y,
                "h_liquid": _finite_list(h_liq),
                "h_vapor": h_vap,
                "temperature": vlle_T,
            }

    # --------------------------------------------------
    # 7. Isothermen berechnen
    # --------------------------------------------------

    isotherms = _make_isotherms(
        x=x,
        y=y,
        T=T,
        pressure=pressure,
        params=params,
        lle=lle_prepared,
    )

    # --------------------------------------------------
    # 8. Gesamtergebnis
    # --------------------------------------------------

    return {
        "mixture": mixture,
        "pressure": pressure,

        "temperature_unit": "°C",
        "enthalpy_unit": "kJ/mol",

        "x": _finite_list(x),
        "y": _finite_list(y),
        "temperature": _finite_list(T),

        "h_liquid": _finite_list(hL / 1000.0),
        "h_vapor": _finite_list(hV / 1000.0),

        "tie_lines": _build_tie_lines(
            x,
            y,
            hL,
            hV,
            T
        ),

        "isotherms": isotherms,

        "azeotrope": azeotrope_out,
        "lle": lle_out,
        "vlle": vlle_out,

        "warning": vle_data.get("warning"),
        "more_message": vle_data.get("more_message"),
    }