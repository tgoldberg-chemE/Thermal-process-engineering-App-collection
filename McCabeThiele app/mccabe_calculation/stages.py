
import numpy as np


def calculate_stages(vle_data, feed, distillate, bottom, reflux_factor, q):
    """
    McCabe-Thiele calculation.

    The construction starts at the bottom composition xB and proceeds
    towards the distillate composition xD.

    Minimum reflux:
    1. Determine the intersection of the q-line and equilibrium curve.
    2. Construct an initial rectifying secant through this point and (xD, xD).
    3. If the secant crosses the equilibrium curve, determine a tangent
       pinch by interval bisection.
    4. Otherwise, retain the original secant.

    Returns operating lines, pinch point, equilibrium-stage data
    and the theoretical stage construction.
    """

    # ---------------------------------------------------------
    # INPUT VALIDATION
    # ---------------------------------------------------------

    try:
        zf, xd, xb, factor, q = map(
            float,
            (feed, distillate, bottom, reflux_factor, q)
        )
    except (TypeError, ValueError):
        raise ValueError("All inputs must be numeric.")

    if not np.all(np.isfinite([zf, xd, xb, factor, q])):
        raise ValueError("All inputs must be finite.")

    if not 0 < xb < zf < xd < 1:
        raise ValueError(
            "Expected 0 < Bottom < Feed < Distillate < 1."
        )

    if factor < 1:
        raise ValueError(
            "The reflux factor must be at least 1."
        )

    if not -1 <= q <= 3:
        raise ValueError(
            "q must be between -1 and 3."
        )

    if not isinstance(vle_data, dict):
        raise ValueError("Invalid VLE data.")

    # ---------------------------------------------------------
    # LOAD VLE DATA
    # ---------------------------------------------------------

    try:
        x = np.asarray(vle_data["x"], dtype=float)
        y = np.asarray(vle_data["y"], dtype=float)
        temp = np.asarray(
            vle_data["temperature"],
            dtype=float
        )
    except (KeyError, TypeError, ValueError):
        raise ValueError("Incomplete VLE data.")

    if x.ndim != 1 or y.ndim != 1 or temp.ndim != 1:
        raise ValueError(
            "VLE arrays must be one-dimensional."
        )

    if len(x) < 3:
        raise ValueError("Not enough VLE points.")

    if not (len(x) == len(y) == len(temp)):
        raise ValueError(
            "VLE arrays have different lengths."
        )

    if not (
        np.all(np.isfinite(x))
        and np.all(np.isfinite(y))
        and np.all(np.isfinite(temp))
    ):
        raise ValueError(
            "VLE data contain non-finite values."
        )

    if np.any(np.diff(x) <= 0):
        raise ValueError(
            "VLE x values must be strictly increasing."
        )

    if xb < x[0] or xd > x[-1]:
        raise ValueError(
            "Product compositions are outside the VLE range."
        )

    def yeq(xv):
        """Equilibrium vapour composition."""
        return float(np.interp(xv, x, y))

    def teq(xv):
        """Equilibrium temperature."""
        return float(np.interp(xv, x, temp))

    # ---------------------------------------------------------
    # VLLE LIMIT
    # ---------------------------------------------------------

    vlle = vle_data.get("vlle")

    if vlle is not None:
        try:
            y_vlle = float(vlle["y"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("Invalid VLLE data.")

        if xd >= y_vlle:
            raise ValueError(
                "For Water-1-Butanol, the distillate "
                "cannot exceed the heterogeneous azeotropic "
                f"vapour composition xD = {y_vlle:.3f}."
            )

    # ---------------------------------------------------------
    # AZEOTROPE LIMIT
    # ---------------------------------------------------------

    azeo = vle_data.get("azeotrope") or {}

    if vlle is None:
        if (
            azeo.get("exists")
            and azeo.get("x") is not None
        ):
            if xd > float(azeo["x"]) + 1e-6:
                raise ValueError(
                    "Distillate composition exceeds "
                    "the azeotropic limit."
                )

    # ---------------------------------------------------------
    # RELATIVE VOLATILITY AT FEED
    # ---------------------------------------------------------

    yf = yeq(zf)

    if not 0 < yf < 1:
        raise ValueError(
            "Cannot calculate relative volatility at feed."
        )

    alpha = (
        (yf / zf)
        /
        ((1.0 - yf) / (1.0 - zf))
    )

    if not np.isfinite(alpha) or alpha <= 0:
        raise ValueError("Invalid relative volatility.")

    # ---------------------------------------------------------
    # q-LINE
    # ---------------------------------------------------------

    if abs(q - 1.0) < 1e-10:

        # Saturated liquid feed: vertical q-line.
        mq = None
        bq = None

        qline = {
            "vertical": True,
            "x": float(zf),
            "x_values": [],
            "y_values": [],
            "y_start": float(zf),
            "y_end": float(yeq(zf))
        }

    else:

        mq = q / (q - 1.0)
        bq = -zf / (q - 1.0)

        qline = {
            "vertical": False,
            "x": None,
            "x_values": [
                float(zf),
                1.0
            ],
            "y_values": [
                float(zf),
                float(mq * (1.0 - zf) + zf)
            ]
        }

    # ---------------------------------------------------------
    # INTERSECTION OF q-LINE AND EQUILIBRIUM CURVE
    # ---------------------------------------------------------

    if mq is None:

        xq = zf

    else:

        grid_q = np.linspace(xb, xd, 5001)

        diff_q = (
            np.interp(grid_q, x, y)
            -
            (mq * grid_q + bq)
        )

        roots = []

        for i in range(len(grid_q) - 1):

            if abs(diff_q[i]) < 1e-10:
                roots.append(float(grid_q[i]))

            elif diff_q[i] * diff_q[i + 1] < 0:

                lo = grid_q[i]
                hi = grid_q[i + 1]
                flo = diff_q[i]

                # Bisection.
                for _ in range(60):

                    mid = 0.5 * (lo + hi)

                    fm = (
                        yeq(mid)
                        -
                        (mq * mid + bq)
                    )

                    if abs(fm) < 1e-11:
                        lo = hi = mid
                        break

                    if flo * fm <= 0:
                        hi = mid
                    else:
                        lo = mid
                        flo = fm

                roots.append(float(0.5 * (lo + hi)))

        if not roots:
            raise ValueError(
                "q-line does not intersect the equilibrium curve."
            )

        # Select the intersection closest to the feed composition.
        xq = min(
            roots,
            key=lambda value: abs(value - zf)
        )

    yq = yeq(xq)

    if mq is None:

        qline["y_start"] = float(zf)
        qline["y_end"] = float(yq)

    else:

        qline["x_values"] = [
            float(zf),
            float(xq)
        ]

        qline["y_values"] = [
            float(zf),
            float(yq)
        ]

    if abs(xq - xd) < 1e-10:
        raise ValueError(
            "q-line intersection coincides with distillate."
        )

    # ---------------------------------------------------------
    # INITIAL RECTIFYING SECANT
    # ---------------------------------------------------------

    # Straight line through (xq, yq) and (xd, xd).

    y0_secant = (
        xd
        -
        (xd - yq) / (xd - xq) * xd
    )

    if not np.isfinite(y0_secant) or y0_secant <= 0:
        raise ValueError(
            "Could not construct a feasible minimum-reflux line."
        )

    # ---------------------------------------------------------
    # TANGENT / SECANT DECISION
    # ---------------------------------------------------------

    tangent_grid = np.linspace(xq, xd, 4001)

    equilibrium_grid = np.interp(
        tangent_grid,
        x,
        y
    )

    def minimum_gap(y_intercept):
        """
        Calculates the minimum difference between
        equilibrium curve and rectifying line.
        """

        slope = (xd - y_intercept) / xd

        operating_values = (
            slope * tangent_grid
            +
            y_intercept
        )

        gaps = equilibrium_grid - operating_values

        index = int(np.argmin(gaps))

        return float(gaps[index]), index

    # Initially use the secant.
    y0_min = float(y0_secant)

    gap_secant, _ = minimum_gap(y0_min)

    # Default pinch point: q-line intersection.
    tangent_x = float(xq)

    # ---------------------------------------------------------
    # CASE 1: SECANT DOES NOT CROSS EQUILIBRIUM CURVE
    # ---------------------------------------------------------

    if gap_secant >= -1e-10:

        y0_min = float(y0_secant)

    # ---------------------------------------------------------
    # CASE 2: SECANT CROSSES EQUILIBRIUM CURVE
    # ---------------------------------------------------------

    else:

        gap_at_zero, _ = minimum_gap(0.0)

        if gap_at_zero < -1e-9:
            raise ValueError(
                "No feasible enriching line was found "
                "below the equilibrium curve."
            )

        y_low = 0.0
        y_high = float(y0_secant)

        # Find the largest feasible y-intercept.
        for _ in range(100):

            y_mid = 0.5 * (y_low + y_high)

            gap_mid, _ = minimum_gap(y_mid)

            if gap_mid >= 0.0:
                y_low = y_mid
            else:
                y_high = y_mid

            if abs(y_high - y_low) < 1e-12:
                break

        y0_min = float(y_low)

        # Determine the tangent point.
        _, tangent_index = minimum_gap(y0_min)

        tangent_x = float(tangent_grid[tangent_index])

    # ---------------------------------------------------------
    # MINIMUM REFLUX RATIO
    # ---------------------------------------------------------

    tangent_y = yeq(tangent_x)

    mmin = (xd - y0_min) / xd

    minimum_reflux_feasible = (
        0.0 < mmin < 1.0
    )

    if abs(1.0 - mmin) < 1e-12:
        rmin = None
        reflux = None
    else:
        rmin = mmin / (1.0 - mmin)
        reflux = factor * rmin

    xp = float(tangent_x)
    yp = float(tangent_y)

    # ---------------------------------------------------------
    # MINIMUM REFLUX CONDITION
    # ---------------------------------------------------------

    minimum_reflux_condition = (
        factor <= 1.0 + 1e-10
    )

    # ---------------------------------------------------------
    # RECTIFYING LINE
    # ---------------------------------------------------------

    warnings = []

    # A reflux ratio of -1 makes the operating-line
    # equation singular. None cannot be used either.
    if reflux is None or abs(reflux + 1.0) < 1e-12:

        if reflux is not None:
            warnings.append({
                "type": "warning",
                "title": "Singular enricher operating line",
                "message": (
                    "The calculated reflux ratio is -1. "
                    "The enricher operating line cannot be "
                    "represented by a finite slope and intercept."
                ),
                "recommendation": (
                    "Change the distillate composition (xD) "
                    "or feed condition (qF), then recalculate."
                )
            })
        else:
            warnings.append({
                "type": "warning",
                "title": "Invalid reflux ratio",
                "message": (
                    "The minimum reflux calculation did not "
                    "produce a finite reflux ratio."
                )
            })

        return {
            "warning": "Physically infeasible operating conditions.",
            "warnings": warnings,
            "more_message": (
                "No valid enricher operating line or theoretical "
                "stage construction can be calculated."
            ),
            "total_stages": None,
            "rectifying_stages": None,
            "stripping_stages": None,
            "minimum_reflux": (
                float(rmin) if rmin is not None else None
            ),
            "actual_reflux": (
                float(reflux) if reflux is not None else None
            ),
            "relative_volatility": float(alpha),
            "stage_x": [],
            "stage_y": [],
            "stage_temperature": [],
            "equilibrium_stage_x": [],
            "equilibrium_stage_y": [],
            "equilibrium_stage_temperature": [],
            "feed_intersection": None,
            "pinch_point": {
                "x": float(xp),
                "y": float(yp)
            },
            "rectifying_line": None,
            "stripping_line": None,
            "q_line": qline
        }

    mr = reflux / (reflux + 1.0)
    br = xd / (reflux + 1.0)

    # ---------------------------------------------------------
    # WARNINGS
    # ---------------------------------------------------------

    if mr < 0:
        warnings.append({
            "type": "warning",
            "title": "Negative slope of the enricher operating line",
            "message": (
                f"The enricher operating line has a negative slope "
                f"(mR = {mr:.4f})."
            )
        })

    if rmin is not None and rmin < 0:
        warnings.append({
            "type": "warning",
            "title": "Negative minimum reflux ratio",
            "message": (
                f"The calculated minimum reflux ratio is negative "
                f"(Rmin = {rmin:.4f}). The separation is not "
                "physically feasible under the selected conditions."
            ),
            "recommendation": (
                "Consider changing the distillate purity (xD) "
                "or feed condition (qF). Recalculate the column "
                "after adjusting the parameters."
            )
        })



    # ---------------------------------------------------------
    # FEED INTERSECTION
    # ---------------------------------------------------------

    if mq is None:

        xi = zf

    else:

        if abs(mr - mq) < 1e-12:
            raise ValueError(
                "q-line and enriching line are parallel."
            )

        xi = (bq - br) / (mr - mq)

    yi = mr * xi + br

    feed_intersection_valid = (
        np.isfinite(xi)
        and np.isfinite(yi)
        and xb < xi < xd
    )

    if not feed_intersection_valid and minimum_reflux_feasible:
        raise ValueError(
            "Operating-line intersection lies outside "
            "the separation range."
        )

    # ---------------------------------------------------------
    # RECTIFYING LINE DATA
    # ---------------------------------------------------------

    rectifying_line = {
        "slope": float(mr),
        "intercept": float(br),
        "x_values": [
            float(xi),
            float(xd)
        ],
        "y_values": [
            float(yi),
            float(xd)
        ]
    }

    # ---------------------------------------------------------
    # STRIPPING LINE
    # ---------------------------------------------------------

    stripping_line = None

    if abs(xi - xb) >= 1e-12:

        ms = (yi - xb) / (xi - xb)

        bs = xb * (1.0 - ms)

        stripping_line = {
            "slope": float(ms),
            "intercept": float(bs),
            "x_values": [
                float(xb),
                float(xi)
            ],
            "y_values": [
                float(xb),
                float(yi)
            ]
        }

    # ---------------------------------------------------------
    # PHYSICALLY INFEASIBLE MINIMUM REFLUX
    # Display operating lines, but do not calculate stages.
    # ---------------------------------------------------------

    if not minimum_reflux_feasible:

        return {
            "warning": "Physically infeasible minimum reflux ratio.",
            "warnings": warnings,
            "more_message": (
                "The minimum reflux ratio is not physically feasible. "
                "The operating lines are displayed for diagnostic "
                "purposes. No theoretical stages are calculated."
            ),
            "total_stages": None,
            "rectifying_stages": None,
            "stripping_stages": None,
            "minimum_reflux": (
                float(rmin) if rmin is not None else None
            ),
            "actual_reflux": (
                float(reflux) if reflux is not None else None
            ),
            "relative_volatility": float(alpha),
            "stage_x": [],
            "stage_y": [],
            "stage_temperature": [],
            "equilibrium_stage_x": [],
            "equilibrium_stage_y": [],
            "equilibrium_stage_temperature": [],
            "feed_intersection": {
                "x": float(xi),
                "y": float(yi)
            },
            "pinch_point": {
                "x": float(xp),
                "y": float(yp)
            },
            "rectifying_line": rectifying_line,
            "stripping_line": stripping_line,
            "q_line": qline
        }

    # ---------------------------------------------------------
    # FEED INTERSECTION VALIDATION
    # ---------------------------------------------------------

    if stripping_line is None:
        raise ValueError(
            "Feed intersection coincides with bottom composition."
        )

    # ---------------------------------------------------------
    # MINIMUM REFLUX:
    # No finite number of stages.
    # ---------------------------------------------------------

    if minimum_reflux_condition:

        return {
            "warning": "Minimum reflux condition.",
            "warnings": warnings,
            "more_message": (
                "At minimum reflux, the theoretical stage "
                "number approaches infinity. The q-line and "
                "both operating lines are displayed."
            ),
            "total_stages": None,
            "rectifying_stages": None,
            "stripping_stages": None,
            "minimum_reflux": float(rmin),
            "actual_reflux": float(reflux),
            "relative_volatility": float(alpha),
            "stage_x": [],
            "stage_y": [],
            "stage_temperature": [],
            "equilibrium_stage_x": [],
            "equilibrium_stage_y": [],
            "equilibrium_stage_temperature": [],
            "feed_intersection": {
                "x": float(xi),
                "y": float(yi)
            },
            "pinch_point": {
                "x": float(xp),
                "y": float(yp)
            },
            "rectifying_line": rectifying_line,
            "stripping_line": stripping_line,
            "q_line": qline
        }

    # ---------------------------------------------------------
    # MCCABE-THIELE STAGE CONSTRUCTION
    # FROM BOTTOM TO DISTILLATE
    # ---------------------------------------------------------

    sx = [float(xb)]
    sy = [float(xb)]

    ex = []
    ey = []
    et = []

    ns = 0
    nr = 0

    current_x = xb

    tolerance = 1e-9
    completed = False

    for _ in range(1000):

        # Equilibrium vapour composition at current liquid x.
        equilibrium_y = yeq(current_x)

        ex.append(float(current_x))
        ey.append(float(equilibrium_y))
        et.append(float(teq(current_x)))

        # Vertical step to equilibrium curve.
        sx.append(float(current_x))
        sy.append(float(equilibrium_y))


        # -----------------------------------------------------
        # SELECT OPERATING LINE
        # MATLAB-compatible stage counting
        # -----------------------------------------------------

        if current_x < xi - tolerance:

            # The step starts in the stripping section.
            # MATLAB counts this step as a stripping stage,
            # even if its endpoint crosses the feed intersection.
            count_section = "stripping"

            slope = ms
            intercept = bs

            if abs(slope) < 1e-12:
                raise ValueError(
                    "Stripping-line slope is zero."
                )

            next_x = (
                equilibrium_y - intercept
            ) / slope

            # If the step crosses the feed intersection,
            # calculate its endpoint using the rectifying line.
            # The stage count remains assigned to stripping.
            if next_x > xi + tolerance:

                slope = mr
                intercept = br

                if abs(slope) < 1e-12:
                    raise ValueError(
                        "Enriching-line slope is zero."
                    )

                next_x = (
                    equilibrium_y - intercept
                ) / slope

        else:

            count_section = "rectifying"

            slope = mr
            intercept = br

            if abs(slope) < 1e-12:
                raise ValueError(
                    "Enriching-line slope is zero."
                )

            next_x = (
                equilibrium_y - intercept
            ) / slope

        # -----------------------------------------------------
        # CHECK STAGE PROGRESSION
        # -----------------------------------------------------

        if (
            not np.isfinite(next_x)
            or next_x <= current_x + tolerance
        ):
            raise ValueError(
                "Stage construction does not progress towards "
                "the distillate. Check the VLE curve and "
                "operating conditions."
            )


        # Final stage: end directly on the diagonal y = x.
        if next_x >= xd - tolerance:

            final_x = float(equilibrium_y)

            # Interpolate equilibrium temperature
            # at the final liquid composition.
            final_temperature = teq(final_x)

            sx.append(final_x)
            sy.append(final_x)

            # Add final equilibrium point.
            ex.append(final_x)
            ey.append(final_x)
            et.append(final_temperature)

            if count_section == "stripping":
                ns += 1
            else:
                nr += 1

            completed = True
            break

        # -----------------------------------------------------
        # NORMAL HORIZONTAL STEP
        # -----------------------------------------------------

        sx.append(float(next_x))
        sy.append(float(equilibrium_y))

        if count_section == "stripping":
            ns += 1
        else:
            nr += 1

        current_x = next_x

    # ---------------------------------------------------------
    # MAXIMUM NUMBER OF STAGES
    # ---------------------------------------------------------

    if not completed:
        raise ValueError(
            "More than 1000 theoretical stages are required."
        )

    total = nr + ns

    # ---------------------------------------------------------
    # RETURN RESULTS
    # ---------------------------------------------------------

    return {
        "warning": "Separation stages calculated!",
        "warnings": warnings,
        "more_message": (
            "McCabe-Thiele stage construction proceeds from bottom "
            "to distillate. The reported total number of stages is the sum "
            "of the enriching and stripping section stages."
        ),
        "total_stages": int(total),
        "rectifying_stages": int(nr),
        "stripping_stages": int(ns),
        "minimum_reflux": float(rmin),
        "actual_reflux": float(reflux),
        "relative_volatility": float(alpha),
        "stage_x": sx,
        "stage_y": sy,
        "stage_temperature": et,
        "equilibrium_stage_x": ex,
        "equilibrium_stage_y": ey,
        "equilibrium_stage_temperature": et,
        "feed_intersection": {
            "x": float(xi),
            "y": float(yi)
        },
        "pinch_point": {
            "x": float(xp),
            "y": float(yp)
        },
        "rectifying_line": rectifying_line,
        "stripping_line": stripping_line,
        "q_line": qline
    }
