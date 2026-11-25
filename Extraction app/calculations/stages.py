import numpy as np
import warnings

class FeedSolventLineError(ValueError):
    def __init__(self, x_feed, y_solvent):
        super().__init__(
            "The feed-solvent line does not intersect the immiscibility gap."
        )

        self.plot_data = {
            "type": "feed_solvent_line",
            "x_feed": np.asarray(x_feed, dtype=float).tolist(),
            "y_solvent": np.asarray(y_solvent, dtype=float).tolist(),
        }

# ============================================================
# Helper functions
# ============================================================

def _prepare_binodal(X_P1, X_P2):
    """Validates and standardizes the two binodal arrays."""
    X_P1 = np.asarray(X_P1, dtype=float)
    X_P2 = np.asarray(X_P2, dtype=float)

    if X_P1.ndim != 2 or X_P2.ndim != 2:
        raise ValueError("X_P1 and X_P2 must be two-dimensional arrays.")

    if X_P1.shape != X_P2.shape or X_P1.shape[1] != 3:
        raise ValueError("X_P1 and X_P2 must have the same shape (n, 3).")

    if len(X_P1) < 2:
        raise ValueError("The binodal requires at least two tie lines.")

    if not np.all(np.isfinite(X_P1)) or not np.all(np.isfinite(X_P2)):
        raise ValueError("The binodal arrays contain invalid values.")

    return X_P1, X_P2


def _interpolate_composition(parameter, compositions, target):
    """
    Interpolates a complete composition.

    Duplicate parameter values are removed jointly
    for all components.
    """
    parameter = np.asarray(parameter, dtype=float)
    compositions = np.asarray(compositions, dtype=float)
    target = float(target)

    order = np.argsort(parameter)

    parameter = parameter[order]
    compositions = compositions[order]

    parameter_unique, indices = np.unique(
        parameter,
        return_index=True
    )

    compositions_unique = compositions[indices]

    if target < parameter_unique[0] or target > parameter_unique[-1]:
        raise ValueError(
            f"Interpolation value {target:.8g} is outside "
            f"the available range "
            f"[{parameter_unique[0]:.8g}, {parameter_unique[-1]:.8g}]."
        )

    result = np.array([
        np.interp(
            target,
            parameter_unique,
            compositions_unique[:, j]
        )
        for j in range(3)
    ])

    total = result.sum()

    if total <= 0:
        raise ValueError("The interpolated composition is invalid.")

    return result / total


# ============================================================
# 1. Fun_LLE_x
# ============================================================

def Fun_LLE_x(xA, X_P1, X_P2):
    """
    Returns both phase compositions of a tie line
    for a specified third mole fraction of phase X.

    Corresponds to the interpolated range of MATLAB Fun_LLE_x.
    """
    X_P1, X_P2 = _prepare_binodal(X_P1, X_P2)

    X = _interpolate_composition(
        X_P1[:, 2],
        X_P1,
        xA
    )

    Y = _interpolate_composition(
        X_P1[:, 2],
        X_P2,
        xA
    )

    return X, Y


# ============================================================
# 2. Fun_LLE_y
# ============================================================

def Fun_LLE_y(yA, X_P1, X_P2):
    """
    Returns both phase compositions of a tie line
    for a specified third mole fraction of phase Y.
    """
    X_P1, X_P2 = _prepare_binodal(X_P1, X_P2)

    Y = _interpolate_composition(
        X_P2[:, 2],
        X_P2,
        yA
    )

    X = _interpolate_composition(
        X_P2[:, 2],
        X_P1,
        yA
    )

    return X, Y


# ============================================================
# 3. Intersection of two lines
# ============================================================

def intersect_twoLines(X_1, X_2, X_3, X_4):
    """
    Calculates the intersection of two lines in a ternary diagram.

    Line 1: X_1 -> X_2
    Line 2: X_3 -> X_4

    Returns:
        X: Ternary composition
        x0: First coordinate
        y0: Second coordinate
    """
    X_1 = np.asarray(X_1, dtype=float)
    X_2 = np.asarray(X_2, dtype=float)
    X_3 = np.asarray(X_3, dtype=float)
    X_4 = np.asarray(X_4, dtype=float)

    p = X_1[:2]
    r = X_2[:2] - X_1[:2]

    q = X_3[:2]
    s = X_4[:2] - X_3[:2]

    denominator = (
        r[0] * s[1] - r[1] * s[0]
    )

    if abs(denominator) < 1e-12:
        raise ValueError("The two lines are parallel or identical.")

    q_minus_p = q - p

    t = (
        q_minus_p[0] * s[1]
        - q_minus_p[1] * s[0]
    ) / denominator

    intersection = p + t * r

    x0 = float(intersection[0])
    y0 = float(intersection[1])

    X = np.array([
        x0,
        y0,
        1.0 - x0 - y0
    ])

    return X, x0, y0


def _find_tie_line_through_mixingpoint(
    point,
    X_P1,
    X_P2
):
    """
    Finds the tie line whose infinite extension has the
    shortest distance to the mixing point.

    The projection may lie outside the binodal segment.

    Returns:
        X, Y: Endpoints of the closest tie line
    """
    point = np.asarray(point, dtype=float)
    X_P1 = np.asarray(X_P1, dtype=float)
    X_P2 = np.asarray(X_P2, dtype=float)

    if point.shape != (3,):
        raise ValueError("The point must contain three components.")

    if len(X_P1) != len(X_P2):
        raise ValueError(
            "X_P1 and X_P2 must contain the same number of points."
        )

    if len(X_P1) == 0:
        raise ValueError("No tie lines are available.")

    best_distance = np.inf
    best_X = None
    best_Y = None

    for i in range(len(X_P1)):

        X = X_P1[i]
        Y = X_P2[i]

        direction = Y - X
        length_squared = np.dot(direction, direction)

        if length_squared < 1e-14:
            projection = X.copy()
        else:
            # Project onto the infinite line.
            t = np.dot(point - X, direction) / length_squared

            projection = X + t * direction

        # Calculate the distance to the mixing point.
        distance = np.linalg.norm(point - projection)

        if distance < best_distance:
            best_distance = distance
            best_X = X.copy()
            best_Y = Y.copy()

    return best_X, best_Y


# ============================================================
# 4. RE_phases
# ============================================================

def RE_phases(M, X_M, X_P1, X_P2):
    """
    Splits the mixing stream M with composition X_M
    into raffinate and extract using an existing tie line.
    """
    X_M = np.asarray(X_M, dtype=float)

    if M <= 0:
        raise ValueError("The mixing flow rate must be positive.")

    # _find_tie_line_through_mixingpoint returns (X_P1, X_P2).
    X_R, Y_E = _find_tie_line_through_mixingpoint(
        X_M, X_P1, X_P2
    )

    denominator = Y_E[1] - X_R[1]

    if abs(denominator) < 1e-12:
        raise ValueError("The lever rule cannot be evaluated.")

    r_fraction = (Y_E[1] - X_M[1]) / denominator
    r_fraction = np.clip(r_fraction, 0.0, 1.0)

    R = M * r_fraction
    E = M - R

    return X_R, Y_E, R, E


def _line_binodal_intersections(
    X_line1,
    X_line2,
    X_P1,
    X_P2,
    X_PP=None,
    tolerance=1e-9
):
    """
    Calculates the intersections of a line with both binodal branches.

    Returns:
        List of (Z, Z_other, t)

        Z       = Closest point on the intersected branch
        Z_other = Corresponding point on the opposite branch
        t       = Position along the line segment
    """
    X_line1 = np.asarray(X_line1, dtype=float)
    X_line2 = np.asarray(X_line2, dtype=float)
    X_P1 = np.asarray(X_P1, dtype=float)
    X_P2 = np.asarray(X_P2, dtype=float)

    if len(X_P1) != len(X_P2):
        raise ValueError(
            "X_P1 and X_P2 must contain the same number of points."
        )

    A = X_line1[:2]
    r = X_line2[:2] - A

    if np.dot(r, r) < tolerance**2:
        raise ValueError("The line is not defined.")

    intersections = []

    def cross(u, v):
        return u[0] * v[1] - u[1] * v[0]

    # Examine both binodal branches.
    for branch_index, branch in enumerate((X_P1, X_P2)):

        other_branch = X_P2 if branch_index == 0 else X_P1

        for i in range(len(branch) - 1):

            B = branch[i, :2]
            C = branch[i + 1, :2]

            s = C - B
            denominator = cross(r, s)

            if abs(denominator) < tolerance:
                continue

            q = B - A

            t = cross(q, s) / denominator
            u = cross(q, r) / denominator

            if (
                -tolerance <= t <= 1 + tolerance
                and -tolerance <= u <= 1 + tolerance
            ):

                t = np.clip(t, 0, 1)
                u = np.clip(u, 0, 1)

                # Select the closest existing binodal point.
                idx = i if u <= 0.5 else i + 1

                Z = branch[idx].copy()
                Z_other = other_branch[idx].copy()

                # Avoid duplicate intersections.
                if not any(
                    np.linalg.norm(Z[:2] - old_Z[:2]) < 1e-7
                    for old_Z, _, _ in intersections
                ):
                    intersections.append(
                        (Z, Z_other, float(t))
                    )

    if not intersections:
        raise ValueError(
            "The line does not intersect the binodal "
            "within the considered line segment."
        )

    # Sort by t.
    intersections.sort(key=lambda item: item[2])

    return intersections


def _select_line_binodal_intersection(
    X_line1,
    X_line2,
    X_P1,
    X_P2,
    X_PP
):
    intersections = _line_binodal_intersections(
        X_line1,
        X_line2,
        X_P1,
        X_P2,
        X_PP
    )

    Z, Z_other, t = max(
        intersections,
        key=lambda item: item[2]
    )

    return Z, Z_other


def SF_ratio(
    X_lb,
    X_ub,
    X_F,
    Y_S,
    X_P1,
    X_P2,
    X_PP
):
    """
    Calculates the minimum solvent-to-feed ratio for
    a line connecting the feed and solvent points.

    Corresponds to the MATLAB SF_ratio function without
    the polynomial contribution.

    Returns:
        nu_m: Minimum solvent-to-feed ratio
        X_max: Maximum raffinate composition
        Y_max: Maximum extract composition
    """
    X_lb = np.asarray(X_lb, dtype=float)
    X_ub = np.asarray(X_ub, dtype=float)
    X_F = np.asarray(X_F, dtype=float)
    Y_S = np.asarray(Y_S, dtype=float)
    X_PP = np.asarray(X_PP, dtype=float)

    X_P1, X_P2 = _prepare_binodal(X_P1, X_P2)

    # Intersection of the feed-solvent line with the
    # complete binodal and the corresponding equilibrium point.
    X_M, X_M_equ = _select_line_binodal_intersection(
        Y_S,
        X_F,
        X_P1,
        X_P2,
        X_PP,
    )

    # Assign the phases as in the MATLAB implementation.
    if X_M[2] < X_PP[2]:
        X_max = X_M
        Y_max = X_M_equ
    else:
        X_max = X_M_equ
        Y_max = X_M

    # Distances along the same feed-solvent line.
    # The ratio is independent of the affine coordinate representation.
    distance_feed = np.linalg.norm(X_M[:2] - X_F[:2])
    distance_solvent = np.linalg.norm(X_M[:2] - Y_S[:2])

    if distance_solvent < 1e-12:
        raise ValueError(
            "The solvent point is practically identical to the intersection."
        )

    nu_m = distance_feed / distance_solvent

    return nu_m, X_max, Y_max


def tangent(Y_S, X_P1, X_P2, X_PP, debug=True):
    """
    Approximately determines the tangent point X_0 and the
    intersection point X_Lim3 of the tangent with the opposite
    side of the ternary diagram.

    Procedure:
    1. Combine both binodal branches.
    2. Examine all internal binodal points.
    3. Determine the connecting line to the solvent point.
    4. Determine the local tangent direction using i-1 and i+1.
    5. Calculate the angle between the lines.
    6. Select the point with the smallest angle.
    7. Extend the tangent to the opposite side of the triangle.

    Returns:
        X_Lim3, X_0
    """
    import numpy as np

    Y_S = np.asarray(Y_S, dtype=float)
    X_PP = np.asarray(X_PP, dtype=float)

    X_P1, X_P2 = _prepare_binodal(X_P1, X_P2)

    # --------------------------------------------------
    # 1. Combine the binodal branches
    # --------------------------------------------------

    # X_P1: bottom right -> X_PP
    # X_P2: bottom left -> X_PP
    # Combined order:
    # bottom right -> X_PP -> bottom left

    X_binodal = np.vstack((
        X_P1,
        X_P2[-2::-1]
    ))

    # --------------------------------------------------
    # 2. Determine the solvent component
    # --------------------------------------------------

    solvent_idx = int(np.argmax(Y_S))

    other_idx = [
        i for i in range(3)
        if i != solvent_idx
    ]

    Y_S_xy = _ternary_to_cartesian(Y_S)

    X_binodal_xy = np.array([
        _ternary_to_cartesian(X)
        for X in X_binodal
    ])

    # --------------------------------------------------
    # 3. Examine all binodal points
    # --------------------------------------------------

    best_angle = np.inf
    best_index = None

    for i in range(1, len(X_binodal) - 1):

        # Connecting vector from the solvent to point i.
        connection_vector = (
            Y_S_xy - X_binodal_xy[i]
        )

        # Local binodal tangent from i-1 to i+1.
        tangent_vector = (
            X_binodal_xy[i + 1]
            - X_binodal_xy[i - 1]
        )

        norm_connection = np.linalg.norm(
            connection_vector
        )

        norm_tangent = np.linalg.norm(
            tangent_vector
        )

        if (
            norm_connection < 1e-12
            or norm_tangent < 1e-12
        ):
            continue

        # Calculate the angle between the two lines.
        cos_angle = np.dot(
            connection_vector,
            tangent_vector
        ) / (norm_connection * norm_tangent)

        cos_angle = np.clip(
            cos_angle, -1.0, 1.0
        )

        # Calculate the angle independently of direction.
        angle = np.degrees(
            np.arccos(abs(cos_angle))
        )

        # Update the best point found so far.
        if angle < best_angle:

            best_angle = angle
            best_index = i

    # --------------------------------------------------
    # 4. Determine the tangent point
    # --------------------------------------------------

    if best_index is None:
        raise ValueError(
            "No valid tangent point could be found."
        )

    X_0 = X_binodal[best_index].copy()

    # --------------------------------------------------
    # 5. Tangent direction in Cartesian coordinates
    # --------------------------------------------------

    tangent_direction_xy = (
        X_binodal_xy[best_index + 1]
        - X_binodal_xy[best_index - 1]
    )

    # Normalize the tangent direction.
    tangent_direction_xy /= np.linalg.norm(
        tangent_direction_xy
    )

    # --------------------------------------------------
    # 6. Intersection with the opposite side of the triangle
    # --------------------------------------------------

    # Vertices of the left side of the triangle:
    # x1 = 0
    A_ternary = np.array([0.0, 1.0, 0.0])
    B_ternary = np.array([0.0, 0.0, 1.0])

    # Convert to Cartesian coordinates.
    A = _ternary_to_cartesian(A_ternary)
    B = _ternary_to_cartesian(B_ternary)

    # Convert X_0 and Y_S to Cartesian coordinates.
    X_0_xy = _ternary_to_cartesian(X_0)
    Y_S_xy = _ternary_to_cartesian(Y_S)

    # Line directions.
    direction_side = B - A
    direction_tangent = Y_S_xy - X_0_xy

    # Intersection:
    # A + s * (B-A) = X_0 + t * (Y_S-X_0)
    matrix = np.column_stack((direction_side, -direction_tangent))
    rhs = X_0_xy - A

    s, t = np.linalg.solve(matrix, rhs)

    # Cartesian intersection point.
    X_Lim3_xy = A + s * direction_side

    # Convert back to ternary coordinates.
    X_Lim3 = np.array([0.0, 1.0 - s, s])

    return X_Lim3, X_0


# ============================================================
# 5. Helper functions for counter-current extraction
#    Use existing binodal points exclusively
# ============================================================

def _select_tieline_by_mass_balance(
    X_P1,
    X_P2,
    reference,
    target,
    flow_min=0.0,
    flow_max=np.inf,
):
    """
    Selects an existing index-matched tie line using a mass balance.

    Minimizes the error of the equation

        e * (Y_E - reference) = target

    over all existing tie lines. No new equilibrium points
    are calculated or interpolated.
    """
    X_P1, X_P2 = _prepare_binodal(X_P1, X_P2)
    reference = np.asarray(reference, dtype=float)[:2]
    target = np.asarray(target, dtype=float)[:2]

    if reference.shape != (2,) or target.shape != (2,):
        raise ValueError(
            "The reference and target must each contain two components."
        )

    directions = X_P2[:, :2] - reference[None, :]
    denominators = np.einsum("ij,ij->i", directions, directions)
    valid = denominators >= 1e-14

    flows = np.full(len(X_P2), np.nan, dtype=float)
    flows[valid] = (
        directions[valid] @ target
    ) / denominators[valid]

    valid &= (flows >= flow_min) & (flows <= flow_max)

    if not np.any(valid):
        raise ValueError(
            "No existing tie line satisfies the mass balance "
            "with an admissible flow rate."
        )

    residuals = flows[:, None] * directions - target[None, :]
    errors = np.linalg.norm(residuals, axis=1)
    errors[~valid] = np.inf

    idx = int(np.argmin(errors))
    flow = float(flows[idx])
    best_error = float(errors[idx])

    return (
        X_P1[idx].copy(),
        X_P2[idx].copy(),
        idx,
        flow,
        best_error,
    )


def _ternary_to_cartesian(X):
    """Converts a ternary composition into two-dimensional coordinates."""
    X = np.asarray(X, dtype=float)

    return np.array([
        X[0] + 0.5 * X[1],
        np.sqrt(3.0) / 2.0 * X[1]
    ])


def _cartesian_to_ternary(x, y):
    """Converts two-dimensional coordinates into a ternary composition."""
    x2 = 2.0 * y / np.sqrt(3.0)
    x1 = x - 0.5 * x2
    x3 = 1.0 - x1 - x2

    return np.array([x1, x2, x3])



def _check_connection_conode_slope(
    X_Rlim,
    Y_S,
    X_conode_R,
    Y_conode_E,
    relative_tolerance=0.05,
):
    """
    Checks the slope relationship between the operating line
    and the corresponding tie line.

    Returns the calculated slopes and any warnings.
    """

    xy_R = _ternary_to_cartesian(X_Rlim)
    xy_S = _ternary_to_cartesian(Y_S)

    xy_conode_R = _ternary_to_cartesian(X_conode_R)
    xy_conode_E = _ternary_to_cartesian(Y_conode_E)

    dx_connection = xy_S[0] - xy_R[0]
    dx_conode = xy_conode_E[0] - xy_conode_R[0]

    if abs(dx_connection) < 1e-12 or abs(dx_conode) < 1e-12:
        raise ValueError("The slope cannot be calculated.")

    m_connection = (
        xy_S[1] - xy_R[1]
    ) / dx_connection

    m_conode = (
        xy_conode_E[1] - xy_conode_R[1]
    ) / dx_conode

    messages = []

    if m_connection >= m_conode:
        messages.append({
            "title": "Infinite number of separation stages",
            "message": (
                f"The slope of the connecting line xR^target - yS ({m_connection:.3f}) "
                f"is greater than or equal to the slope of the tie line in xR^target ({m_conode:.3f}). "
                "This results in an infinite number of stages, regardless of the solvent-to-feed ratio."
            ),
            "recommendation": (
                "Revise the specified compositions."
            )
        })

    elif abs(m_conode) > 1e-12:
        relative_difference = abs(
            (m_conode - m_connection) / m_conode
        )

        if relative_difference < relative_tolerance:
            messages.append({
                "title": "High number of separation stages",
                "message": (
                    "The slope of the connecting line xR^target - yS is very close to "
                    "the slope of the tie line in xR^target. "
                    "This may result in a high number of theoretical stages."
                ),
                "recommendation": (
                    "Consider adjusting the specified compositions."
                )
            })

    return {
        "m_connection": float(m_connection),
        "m_conode": float(m_conode),
        "warnings": messages
    }



def _counter_current_conode_slope(X_P1, X_P2, X_PP):
    """
    Determines the slope of the existing tie line whose midpoint
    is closest to the plait point.

    No new tie lines are generated.
    """
    midpoints = 0.5 * (X_P1 + X_P2)

    distances = np.linalg.norm(
        midpoints - X_PP,
        axis=1
    )

    idx = int(np.argmin(distances))

    p1 = _ternary_to_cartesian(X_P1[idx])
    p2 = _ternary_to_cartesian(X_P2[idx])

    dx = p2[0] - p1[0]

    if abs(dx) < 1e-12:
        raise ValueError(
            "The selected tie line does not have a defined slope."
        )

    return float((p2[1] - p1[1]) / dx)


def _counter_current_nu_min(
    X_F,
    X_RN,
    Y_S,
    X_P1,
    X_P2,
    X_PP,
    condition
):
    """
    Calculates the minimum solvent-to-feed ratio.

    condition == 1:
        Existing tie line near the feed point.

    condition == 2:
        Plait point used as X_Max and Y_Max.

    The mass balance is solved using a linear system.
    No new equilibrium points are calculated.
    """
    X_F = np.asarray(X_F, dtype=float)
    X_RN = np.asarray(X_RN, dtype=float)
    Y_S = np.asarray(Y_S, dtype=float)
    X_PP = np.asarray(X_PP, dtype=float)

    X_P1, X_P2 = _prepare_binodal(X_P1, X_P2)

    if condition == 1:
        X_Max, Y_Max = _find_tie_line_through_mixingpoint(
            X_F,
            X_P1,
            X_P2
        )

    elif condition == 2:
        X_Max = X_PP.copy()
        Y_Max = X_PP.copy()

    else:
        raise ValueError("condition must be either 1 or 2.")

    # Unknowns:
    # [E1, RN, S]
    #
    # Component balance:
    # Y_Max * E1 + X_RN * RN - Y_S * S = X_F
    #
    # Total balance:
    # E1 + RN - S = 1

    A = np.array([
        [Y_Max[0], X_RN[0], -Y_S[0]],
        [Y_Max[1], X_RN[1], -Y_S[1]],
        [1.0,      1.0,     -1.0]
    ])

    b = np.array([
        X_F[0],
        X_F[1],
        1.0
    ])

    try:
        solution = np.linalg.solve(A, b)
    except np.linalg.LinAlgError as exc:
        raise ValueError(
            "The mass balance for nu_min cannot be solved uniquely."
        ) from exc

    E1_min, RN_min, S_min = solution

    residual = A @ solution - b

    if np.linalg.norm(residual) > 1e-7:
        raise ValueError(
            "The mass balance for nu_min could not be satisfied "
            "with sufficient accuracy."
        )

    nu_min = float(S_min)

    return nu_min, X_Max, Y_Max


# ============================================================
# 6. Operating regions for counter-current extraction
# ============================================================

def _counter_current_limits(
    Y_S,
    X_PP,
    X_P1,
    X_P2
):
    """
    Calculates X_Lim1 and X_Lim2 according to the MATLAB code.

    mCon is determined from the existing tie line
    closest to the plait point.
    """
    Y_S = np.asarray(Y_S, dtype=float)
    X_PP = np.asarray(X_PP, dtype=float)

    X_P1, X_P2 = _prepare_binodal(X_P1, X_P2)

    xy_S = _ternary_to_cartesian(Y_S)
    xy_PP = _ternary_to_cartesian(X_PP)
    xy_C = _ternary_to_cartesian([0.0, 1.0, 0.0])

    m_C = xy_C[1] / xy_C[0]

    m_con = _counter_current_conode_slope(
        X_P1,
        X_P2,
        X_PP
    )

    if abs(m_con - m_C) < 1e-12:
        raise ValueError(
            "X_Lim1 cannot be calculated: "
            "mCon and mC are nearly equal."
        )

    # --------------------------------------------------------
    # X_Lim1
    # --------------------------------------------------------

    x_lim1 = (
        m_con * xy_PP[0] - xy_PP[1]
    ) / (m_con - m_C)

    y_lim1 = m_C * x_lim1

    X_Lim1 = _cartesian_to_ternary(
        x_lim1,
        y_lim1
    )

    # --------------------------------------------------------
    # X_Lim2
    # --------------------------------------------------------

    denominator = xy_S[0] - xy_PP[0]

    if abs(denominator) < 1e-12:
        raise ValueError(
            "X_Lim2 cannot be calculated."
        )

    m = (
        xy_S[1] - xy_PP[1]
    ) / denominator

    if abs(m - m_C) < 1e-12:
        raise ValueError(
            "X_Lim2 cannot be calculated: "
            "the lines are parallel."
        )

    x_lim2 = (
        m * xy_PP[0] - xy_PP[1]
    ) / (m - m_C)

    y_lim2 = m_C * x_lim2

    X_Lim2 = _cartesian_to_ternary(
        x_lim2,
        y_lim2
    )

    return X_Lim1, X_Lim2, m_con


# ============================================================
# 7. Counter-current extraction – initial calculation
# ============================================================

def calculate_counter_current(
    x_feed,
    y_solvent,
    xR_limit,
    X_P1,
    X_P2,
    X_PP,
    f,
    max_stages=100,
    yield_limit=None,
    _candidate_mode=False,
):
    """
    Calculates the input values for counter-current extraction:

    1. Tangent at the solvent point
    2. Feed admissibility check
    3. Determination of the operating regions
    4. Calculation of nu_min
    5. Calculation of X_Pi
    6. Calculation of the first mixing point
    7. Counter-current stage construction using mass balances

    All equilibrium compositions are taken from the existing,
    index-matched binodal points.
    """
    x_feed = np.asarray(x_feed, dtype=float)
    y_solvent = np.asarray(y_solvent, dtype=float)
    X_PP = np.asarray(X_PP, dtype=float)

    # Preserve the original order for internal candidate calls,
    # since phase normalization is performed exactly once per call.
    X_P1_input = np.asarray(X_P1, dtype=float)
    X_P2_input = np.asarray(X_P2, dtype=float)

    # The binodal branches returned by calculate_binodal have
    # the opposite phase order. Normalize them internally:
    # X_P1 = raffinate branch, X_P2 = extract branch.
    # The index-matched tie-line pairs remain unchanged.
    X_P1, X_P2 = _prepare_binodal(X_P2, X_P1)

    # If a minimum extraction yield is specified, determine X_RN
    # from the existing raffinate points. Each candidate undergoes
    # the complete counter-current calculation. No new equilibrium
    # points or tie lines are generated.
    if yield_limit is not None and not _candidate_mode:
        if not np.isfinite(yield_limit) or not 0.0 <= yield_limit <= 100.0:
            raise ValueError("yield_limit must be between 0 and 100%.")

        candidates = []
        errors = []

        for candidate in X_P1:
            try:
                result = calculate_counter_current(
                    x_feed=x_feed,
                    y_solvent=y_solvent,
                    xR_limit=float(candidate[1]),
                    X_P1=X_P1_input,
                    X_P2=X_P2_input,
                    X_PP=X_PP,
                    f=f,
                    max_stages=max_stages,
                    yield_limit=None,
                    _candidate_mode=True,
                )

                achieved = result.get("yield", np.nan)

                if np.isfinite(achieved) and achieved >= yield_limit:
                    candidates.append(result)

            except FeedSolventLineError:
                    raise

            except (ValueError, np.linalg.LinAlgError) as exc:
                    errors.append(str(exc))

        if not candidates:
            raise ValueError(
                f"The minimum extraction yield of {yield_limit:g}% "
                "cannot be achieved using the existing binodal points "
                "and the selected operating conditions."
            )

        # Select the lowest achieved yield above the specified limit.
        selected = min(candidates, key=lambda item: item["yield"])
        selected["yield_limit"] = float(yield_limit)
        selected["xR_limit"] = float(selected["X_RN"][1])
        selected["stopped_by"] = "yield_limit"

        return selected

    if xR_limit is None or not np.isfinite(xR_limit) or not 0.0 <= xR_limit <= 1.0:
        raise ValueError(
            "A valid raffinate composition limit or yield_limit must be specified."
        )

    # Map xR_limit to an actually existing point in X_P1.
    idx_RN = int(np.argmin(np.abs(X_P1[:, 1] - xR_limit)))
    X_RN = X_P1[idx_RN].copy()

    # --------------------------------------------------------
    # Validate input data
    # --------------------------------------------------------

    if any(
        arr.shape != (3,)
        for arr in (x_feed, y_solvent, X_RN, X_PP)
    ):
        raise ValueError(
            "The feed, solvent, X_RN and X_PP must each "
            "contain exactly three components."
        )

    for name, composition in (
        ("Feed", x_feed),
        ("Solvent", y_solvent),
        ("X_RN", X_RN),
        ("X_PP", X_PP)
    ):
        if not np.isclose(composition.sum(), 1.0, atol=1e-8):
            raise ValueError(
                f"The composition of {name} must sum to 1."
            )

    if f < 1.0:
        raise ValueError(
            "The solvent factor f must be at least 1 "
            "for counter-current extraction."
        )

    if max_stages < 1:
        raise ValueError("max_stages must be at least 1.")

    # --------------------------------------------------------
    # 1. Determine the tangent at the solvent point
    # --------------------------------------------------------

    X_Ub, X_tangent = tangent(
        y_solvent,
        X_P1,
        X_P2,
        X_PP
    )

    # --------------------------------------------------------
    # 2. Check feed admissibility
    # --------------------------------------------------------

    if x_feed[1] > X_Ub[1]:
        raise FeedSolventLineError(x_feed, y_solvent)

    # --------------------------------------------------------
    # 3. Determine the operating regions
    # --------------------------------------------------------

    X_Lim1, X_Lim2, m_con = _counter_current_limits(
        y_solvent,
        X_PP,
        X_P1,
        X_P2
    )

    # --------------------------------------------------------
    # 4. Calculate nu_min and X_Pi
    # --------------------------------------------------------

    if x_feed[1] > X_Lim2[1]:

        # Operating region 3:
        # Corresponds to the MATLAB SF_ratio call.

        nu_min, X_MAX, Y_MAX = SF_ratio(
            X_tangent,
            x_feed,
            x_feed,
            y_solvent,
            X_P1,
            X_P2,
            X_PP
        )

        X_Pi = y_solvent.copy()
        region = 3

    elif x_feed[1] > X_Lim1[1]:

        # Operating region 2:
        # The plait point is used as the maximum equilibrium composition.

        nu_min, X_MAX, Y_MAX = _counter_current_nu_min(
            x_feed,
            X_RN,
            y_solvent,
            X_P1,
            X_P2,
            X_PP,
            condition=2
        )

        X_Pi, _, _ = intersect_twoLines(
            Y_MAX,
            x_feed,
            X_RN,
            y_solvent
        )

        region = 2

    else:

        # Operating region 1:
        # Tie line through or as close as possible to the feed.

        nu_min, X_MAX, Y_MAX = _counter_current_nu_min(
            x_feed,
            X_RN,
            y_solvent,
            X_P1,
            X_P2,
            X_PP,
            condition=1
        )

        X_Pi, _, _ = intersect_twoLines(
            Y_MAX,
            x_feed,
            X_RN,
            y_solvent
        )

        region = 1

    # --------------------------------------------------------
    # 5. Calculate the actual solvent-to-feed ratio
    # --------------------------------------------------------

    nu = nu_min * f

    # --------------------------------------------------------
    # 6. Calculate the first mixing point
    # --------------------------------------------------------

    X_M_f1 = (
        x_feed + y_solvent * nu_min
    ) / (1.0 + nu_min)

    X_M = (
        x_feed + y_solvent * nu
    ) / (1.0 + nu)

    # --------------------------------------------------------
    # 7. Special case: minimum solvent ratio
    # --------------------------------------------------------
 
    if np.isclose(f, 1.0):
        return {
            "X_R": np.asarray([x_feed]),
            "Y_E": Y_MAX,
            "X_M": np.empty((0, 3)),

            "R": np.asarray([1.0]),
            "E": np.empty(0),
            "S": np.empty(0),
            "M": np.empty(0),

            "stages": "∞",
            "yield": 0.0,

            # At the minimum solvent ratio, no extraction occurs.
            # The entire feed leaves the system as raffinate.
            "xi": np.empty(0),

            "stopped_by": "minimum_solvent_ratio",

            "nu": nu,
            "nu_min": nu_min,

            "X_Ub": X_Ub,
            "X_tangent": X_tangent,

            "X_M_f1": X_M_f1,
            "X_MAX": X_MAX,
            "Y_MAX": Y_MAX,
        }

    # --------------------------------------------------------
    # Check the slope condition
    # --------------------------------------------------------

    slope_check = _check_connection_conode_slope(
        X_Rlim=X_RN,
        Y_S=y_solvent,
        X_conode_R=X_P1[idx_RN],
        Y_conode_E=X_P2[idx_RN],
    )

    calculation_warnings = slope_check["warnings"]

    # --------------------------------------------------------
    # 8. Counter-current stage construction
    # --------------------------------------------------------

    stage_results = _counter_current_stages(
        x_feed=x_feed,
        y_solvent=y_solvent,
        X_RN=X_RN,
        X_M=X_M,
        nu=nu,
        X_P1=X_P1,
        X_P2=X_P2,
        max_stages=max_stages
    )

    # --------------------------------------------------------
    # 9. Combine results
    # --------------------------------------------------------

    return {
        "x_feed": x_feed,
        "y_solvent": y_solvent,

        "X_RN": X_RN,
        "X_Ub": X_Ub,
        "X_tangent": X_tangent,

        "X_Lim1": X_Lim1,
        "X_Lim2": X_Lim2,
        "m_con": m_con,
        "region": region,

        "nu_min": nu_min,
        "nu": nu,

        "X_MAX": X_MAX,
        "Y_MAX": Y_MAX,
        "X_Pi": stage_results["X_Pi"],
        "X_M": X_M,
        "X_M_real": stage_results["X_M_real"],
        "X_M_f1": X_M_f1,

        "X_R": stage_results["X_R"],
        "Y_E": stage_results["Y_E"],

        "selected_tieline_indices":
            stage_results["selected_tieline_indices"],

        "stages": stage_results["stages"],
        "yield": stage_results["yield"],
        "xi": stage_results["xi"],
        "stopped_by": stage_results["stopped_by"],
        "e1": stage_results["e1"],
        "pi": stage_results["pi"],
        "extract_flows": stage_results["extract_flows"],
        "mass_balance_errors": stage_results["mass_balance_errors"],
        "warnings": calculation_warnings
    }


# ============================================================
# 8. Counter-current stage construction
# ============================================================

def _counter_current_stages(
    x_feed,
    y_solvent,
    X_RN,
    X_M,
    nu,
    X_P1,
    X_P2,
    max_stages=100,
):
    """
    Calculates counter-current extraction stages exclusively
    using mass balances.

    First stage:
        m * X_M = e1 * Y_E1 + (m - e1) * X_RN

    Pole point:
        pi = 1 - e1
        X_Pi = (x_feed - e1 * Y_E1) / pi

    Subsequent stages:
        e_i * (Y_Ei - X_R,i-1) = pi * (X_R,i-1 - X_Pi)

    All equilibrium pairs are taken unchanged from the
    existing index-matched binodal points.
    """
    X_P1, X_P2 = _prepare_binodal(X_P1, X_P2)

    x_feed = np.asarray(x_feed, dtype=float)
    X_RN = np.asarray(X_RN, dtype=float)
    X_M = np.asarray(X_M, dtype=float)
    y_solvent = np.asarray(y_solvent, dtype=float)

    m = 1.0 + float(nu)

    # --------------------------------------------------------
    # 1. First extraction stage
    # --------------------------------------------------------

    X_R1, Y_E1, idx, e1, error = _select_tieline_by_mass_balance(
        X_P1=X_P1,
        X_P2=X_P2,
        reference=X_RN,
        target=m * (X_M - X_RN),
        flow_min=0.0,
        flow_max=m,
    )

    # --------------------------------------------------------
    # 2. Calculate the pole point
    # --------------------------------------------------------

    pi = 1.0 - e1

    if abs(pi) < 1e-12:
        raise ValueError(
            "The pole point cannot be calculated because pi is "
            "zero or too close to zero."
        )

    X_Pi = (x_feed - e1 * Y_E1) / pi

    if not np.all(np.isfinite(X_Pi)):
        raise ValueError(
            "The calculated pole point contains invalid values."
        )

    if not np.isclose(np.sum(X_Pi), 1.0, atol=1e-6):
        raise ValueError(
            "The calculated pole point does not satisfy "
            "the composition sum constraint."
        )

    # --------------------------------------------------------
    # 3. Initialize stage data
    # --------------------------------------------------------

    X_R = [x_feed.copy(), X_R1.copy()]
    Y_E = [Y_E1.copy()]

    selected_indices = [idx]
    extract_flows = [e1]
    mass_balance_errors = [error]

    X_R_current = X_R1.copy()
    stopped_by = "max_stages"

    # --------------------------------------------------------
    # 4. Calculate subsequent extraction stages
    # --------------------------------------------------------

    while len(Y_E) < max_stages:

        if X_R_current[1] < X_RN[1]:
            stopped_by = "raffinate_limit"
            break

        X_R_next, Y_E_next, idx, e, error = (
            _select_tieline_by_mass_balance(
                X_P1=X_P1,
                X_P2=X_P2,
                reference=X_R_current,
                target=pi * (X_R_current - X_Pi),
                flow_min=0.0,
            )
        )

        X_R.append(X_R_next.copy())
        Y_E.append(Y_E_next.copy())

        selected_indices.append(idx)
        extract_flows.append(e)
        mass_balance_errors.append(error)

        X_R_current = X_R_next.copy()

        if X_R_current[1] < X_RN[1]:
            stopped_by = "raffinate_limit"
            break

    # --------------------------------------------------------
    # 5. Overall mass balance
    # --------------------------------------------------------
    #
    # There is one final extract product stream and one final
    # raffinate product stream.
    #
    # Their compositions are:
    #   Extract:   Y_E[0]
    #   Raffinate: X_R[-1]
    #
    # The feed flow rate is normalized to F = 1.
    # The solvent flow rate is nu.
    #
    # Overall mass balance:
    #
    # E_product * Y_E[0] + R_product * X_R[-1]
    #     = x_feed + nu * y_solvent
    # --------------------------------------------------------

    X_M_real = None

    total_in = x_feed + nu * y_solvent

    outlet_compositions = np.column_stack(
        (Y_E[0], X_R[-1])
    )

    # Solve for the two product flow rates:
    # [E_product, R_product]

    product_flows, _, _, _ = np.linalg.lstsq(
        outlet_compositions,
        total_in,
        rcond=None,
    )

    E_product = float(product_flows[0])
    R_product = float(product_flows[1])

    # Calculate the overall mass balance residual.

    balance_residual = (
        E_product * Y_E[0]
        + R_product * X_R[-1]
        - total_in
    )

    mass_balance_error = float(
        np.linalg.norm(balance_residual)
    )

    # --------------------------------------------------------
    # 6. Validate the product flow rates
    # --------------------------------------------------------

    target_component_in = float(total_in[1])

    if target_component_in <= 1e-12:
        raise ValueError(
            "The total amount of the target component entering "
            "the system is zero. The extraction yield cannot "
            "be calculated."
        )

    if E_product < -1e-9 or R_product < -1e-9:
        raise ValueError(
            "The overall mass balance results in a negative "
            "product flow rate. The selected outlet phase "
            "compositions are therefore not physically "
            "compatible with the overall mass balance."
        )

    # --------------------------------------------------------
    # 7. Calculate extraction yield
    # --------------------------------------------------------

    yield_value = (
        E_product * Y_E[0][1] / target_component_in
    ) * 100.0

    # --------------------------------------------------------
    # 8. Calculate xi
    # --------------------------------------------------------
    #
    # Definition:
    #
    # xi = raffinate product flow / feed flow
    #
    # Since the feed flow rate is normalized to F = 1:
    #
    # xi = R_product
    # --------------------------------------------------------

    xi = R_product

    # --------------------------------------------------------
    # 9. Return results
    # --------------------------------------------------------

    return {
        "X_R": np.asarray(X_R),
        "Y_E": np.asarray(Y_E),

        "X_Pi": X_Pi,
        "X_M_real": X_M_real,

        "e1": float(e1),
        "pi": float(pi),

        "extract_flows": np.asarray(extract_flows),
        "selected_tieline_indices": np.asarray(
            selected_indices,
            dtype=int,
        ),

        "mass_balance_errors": np.asarray(
            mass_balance_errors
        ),

        "stages": len(Y_E),
        "yield": float(yield_value),
        "xi": float(xi),

        "extract_product_flow": E_product,
        "raffinate_product_flow": R_product,

        "overall_mass_balance_error": mass_balance_error,
        "overall_mass_balance_residual": balance_residual,

        "stopped_by": stopped_by,
    }


# ============================================================
# 9. Cross-current extraction
# ============================================================

def calculate_cross_current(
    x_feed,
    y_solvent,
    X_P1,
    X_P2,
    X_PP,
    f,
    nu_const=True,
    S_const=False,
    xR_limit=None,
    yield_limit=None,
    max_stages=100,
    feed=1.0,
):
    """
    Calculates cross-current liquid-liquid extraction.

    Calculation sequence:
    1. Determine the tangent at the solvent point.
    2. Check whether the feed is within the admissible mixing region.
    3. Calculate the minimum solvent-to-feed ratio.
    4. Calculate the actual solvent-to-feed ratio.
    5. Check the initial mixing point.
    6. Perform the stage-wise phase separation.
    7. Calculate the overall extraction yield.
    8. Calculate the final raffinate-to-feed ratio.

    All equilibrium compositions are taken from the existing,
    index-matched binodal points.
    """
    x_feed = np.asarray(x_feed, dtype=float)
    y_solvent = np.asarray(y_solvent, dtype=float)
    X_PP = np.asarray(X_PP, dtype=float)

    # Normalize the binodal branches to the required phase order.
    # X_P1 represents the raffinate branch.
    # X_P2 represents the extract branch.
    # The index-matched tie-line pairs are preserved.
    X_P1, X_P2 = _prepare_binodal(X_P2, X_P1)

    # --------------------------------------------------------
    # 0. Validate input data
    # --------------------------------------------------------

    if x_feed.shape != (3,) or y_solvent.shape != (3,):
        raise ValueError(
            "The feed and solvent compositions must each "
            "contain exactly three components."
        )

    if X_PP.shape != (3,):
        raise ValueError(
            "The plait point must contain exactly three components."
        )

    if not np.all(np.isfinite(x_feed)) or not np.all(np.isfinite(y_solvent)):
        raise ValueError(
            "The feed or solvent composition contains invalid values."
        )

    if not np.all(np.isfinite(X_PP)):
        raise ValueError(
            "The plait point contains invalid values."
        )

    if not np.isclose(x_feed.sum(), 1.0, atol=1e-8):
        raise ValueError(
            "The feed composition must sum to 1."
        )

    if not np.isclose(y_solvent.sum(), 1.0, atol=1e-8):
        raise ValueError(
            "The solvent composition must sum to 1."
        )

    if not np.isclose(X_PP.sum(), 1.0, atol=1e-8):
        raise ValueError(
            "The plait point composition must sum to 1."
        )

    if nu_const == S_const:
        raise ValueError(
            "Exactly one operating mode must be selected: "
            "constant solvent-to-feed ratio or constant solvent flow rate."
        )

    if not np.isfinite(feed) or feed <= 0:
        raise ValueError(
            "The feed flow rate must be a positive finite value."
        )

    if not np.isfinite(f) or f < 0:
        raise ValueError(
            "The solvent factor f must be a non-negative finite value."
        )

    if max_stages < 1:
        raise ValueError(
            "The maximum number of stages must be at least 1."
        )

    if yield_limit is not None:
        if not np.isfinite(yield_limit) or not 0 <= yield_limit <= 100:
            raise ValueError(
                "The extraction yield limit must be between 0 and 100%."
            )

    if xR_limit is not None:
        if not np.isfinite(xR_limit) or not 0 <= xR_limit <= 1:
            raise ValueError(
                "The raffinate composition limit must be between 0 and 1."
            )

    # --------------------------------------------------------
    # 1. Determine the tangent at the solvent point
    # --------------------------------------------------------

    X_Ub, X_tangent = tangent(
        y_solvent,
        X_P1,
        X_P2,
        X_PP
    )

    # --------------------------------------------------------
    # 2. Check feed admissibility
    # --------------------------------------------------------

    if x_feed[1] > X_Ub[1]:
        raise FeedSolventLineError(x_feed, y_solvent)

    # --------------------------------------------------------
    # 3. Calculate the minimum solvent-to-feed ratio
    # --------------------------------------------------------

    nu_min, Y_MAX, X_MAX = SF_ratio(
        X_tangent,
        x_feed,
        x_feed,
        y_solvent,
        X_P1,
        X_P2,
        X_PP
    )

    X_M_f1 = X_MAX

    if not np.isfinite(nu_min) or nu_min < 0:
        raise ValueError(
            "The minimum solvent-to-feed ratio is invalid."
        )

    # --------------------------------------------------------
    # 4. Calculate the actual solvent-to-feed ratio
    # --------------------------------------------------------

    nu = nu_min * f

    # --------------------------------------------------------
    # 5. Special case: minimum solvent ratio
    # --------------------------------------------------------
    #
    # At f = 1, no extraction takes place.
    # The entire feed leaves the system as raffinate.
    # Therefore, xi = R_last / F = 1.
    # --------------------------------------------------------

    if np.isclose(f, 1.0):
        return {
            "x_feed": x_feed.tolist(),
            "y_solvent": y_solvent.tolist(),

            "X_R": np.asarray([x_feed]),
            "Y_E": Y_MAX,
            "X_M": X_M_f1,

            "R": np.asarray([feed]),
            "E": np.empty(0),
            "S": np.empty(0),
            "M": np.empty(0),

            "stages": "∞",
            "yield": 0.0,
            "xi": np.empty(0),

            "stopped_by": "minimum_solvent_ratio",

            "nu": nu,
            "nu_min": nu_min,

            "X_Ub": X_Ub,
            "X_tangent": X_tangent,
            "X_M_f1": X_M_f1,
            "X_MAX": X_MAX,
            "Y_MAX": Y_MAX,
        }

    # --------------------------------------------------------
    # 6. Check the connection-line and tie-line slopes
    # --------------------------------------------------------

    calculation_warnings = []

    if xR_limit is not None:

        idx_Rlim = int(
            np.argmin(np.abs(X_P1[:, 1] - xR_limit))
        )

        X_Rlim = X_P1[idx_Rlim]

        slope_check = _check_connection_conode_slope(
            X_Rlim=X_Rlim,
            Y_S=y_solvent,
            X_conode_R=X_P1[idx_Rlim],
            Y_conode_E=X_P2[idx_Rlim],
        )

        calculation_warnings = slope_check["warnings"]

    # --------------------------------------------------------
    # 7. Calculate the initial mixing point
    # --------------------------------------------------------

    X_M_initial = (
        x_feed + y_solvent * nu
    ) / (1.0 + nu)

    if not np.all(np.isfinite(X_M_initial)):
        raise ValueError(
            "The initial mixing point contains invalid values."
        )

    # --------------------------------------------------------
    # 8. Check whether the initial mixing point is admissible
    # --------------------------------------------------------

    if X_M_initial[2] < X_PP[2]:

        _, Y_LLE_lim = Fun_LLE_y(
            X_M_initial[2],
            X_P1,
            X_P2
        )

        if Y_LLE_lim[1] < X_M_initial[1]:
            raise ValueError(
                "The solvent-to-feed ratio is too high. "
                "The initial mixing point lies outside "
                "the admissible liquid-liquid equilibrium region."
            )

    # --------------------------------------------------------
    # 9. Initialize stage data
    # --------------------------------------------------------

    X_R = [x_feed.copy()]
    Y_E = []
    X_M = []

    R = [float(feed)]
    E = []
    S = []
    M = []

    S_first = feed * nu

    yield_total = 0.0
    stage_count = 0
    stopped_by = None

    # --------------------------------------------------------
    # 10. Perform stage-wise extraction
    # --------------------------------------------------------

    for i in range(max_stages):

        # Determine the solvent flow rate for the current stage.
        if nu_const:
            S_i = R[-1] * nu
        else:
            S_i = S_first

        S.append(float(S_i))

        # Calculate the total mixing flow rate.
        M_i = R[-1] + S_i
        M.append(float(M_i))

        if M_i <= 0:
            raise ValueError(
                f"The total mixing flow rate in stage {i + 1} "
                "is zero or negative."
            )

        # Calculate the mixing-point composition.
        XM_i = (
            R[-1] * X_R[-1] + S_i * y_solvent
        ) / M_i

        X_M.append(XM_i.copy())

        # Perform equilibrium phase separation.
        XR_i, YE_i, R_i, E_i = RE_phases(
            M_i,
            XM_i,
            X_P1,
            X_P2
        )

        X_R.append(np.asarray(XR_i, dtype=float))
        Y_E.append(np.asarray(YE_i, dtype=float))

        R.append(float(R_i))
        E.append(float(E_i))

        stage_count += 1

        # ----------------------------------------------------
        # Calculate the overall extraction yield
        # ----------------------------------------------------

        extracted_component = sum(
            Y_E[j][1] * E[j]
            for j in range(len(E))
        )

        total_component = (
            x_feed[1] * feed
            + y_solvent[1] * sum(S)
        )

        if total_component > 0:
            yield_total = (
                extracted_component / total_component * 100.0
            )
        else:
            raise ValueError(
                "The total amount of the target component "
                "entering the system is zero. "
                "The extraction yield cannot be calculated."
            )

        # ----------------------------------------------------
        # Check the stopping criteria
        # ----------------------------------------------------

        if (
            xR_limit is not None
            and XR_i[1] < xR_limit
        ):
            stopped_by = "raffinate_limit"
            break

        if (
            yield_limit is not None
            and yield_total > yield_limit
        ):
            stopped_by = "yield_limit"
            break

    # --------------------------------------------------------
    # 11. Set the stopping reason
    # --------------------------------------------------------

    if stopped_by is None:
        stopped_by = "max_stages"

    # --------------------------------------------------------
    # 12. Calculate xi
    # --------------------------------------------------------
    #
    # Definition:
    #
    # xi = final raffinate flow rate / feed flow rate
    #
    # R[-1] is the raffinate flow rate leaving the final stage.
    # feed is the initial feed flow rate.
    # --------------------------------------------------------

    xi = float(R[-1] / feed)

    # --------------------------------------------------------
    # 13. Return results
    # --------------------------------------------------------

    return {
        "x_feed": x_feed.tolist(),
        "y_solvent": y_solvent.tolist(),

        "X_R": np.asarray(X_R),
        "Y_E": np.asarray(Y_E),
        "X_M": np.asarray(X_M),

        "R": np.asarray(R),
        "E": np.asarray(E),
        "S": np.asarray(S),
        "M": np.asarray(M),

        "stages": stage_count,
        "yield": float(yield_total),
        "xi": xi,

        "stopped_by": stopped_by,

        "nu": float(nu),
        "nu_min": float(nu_min),

        "X_Ub": X_Ub,
        "X_tangent": X_tangent,
        "X_M_f1": X_M_f1,
        "X_MAX": X_MAX,
        "Y_MAX": Y_MAX,
        "warnings": calculation_warnings
    }