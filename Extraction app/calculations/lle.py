
import numpy as np

from scipy.optimize import least_squares
from scipy.special import softmax, expit


# ============================================================
# SETTINGS
# ============================================================

ALPHA_DEFAULT = 0.2

PHASE_DISTANCE_TOL = 1e-3

INITIAL_STEP_X2 = 0.002

INITIAL_ARC_STEP = 0.05
MIN_ARC_STEP = 1e-6
MAX_ARC_STEP = 0.1

MAX_POINTS = 1000

MAX_NFEV = 3000
RESIDUAL_TOL = 1e-8


# ============================================================
# 1. NRTL MODEL
# ============================================================

def nrtl(x, T, A, alpha=ALPHA_DEFAULT):

    x = np.asarray(x, dtype=float)
    A = np.asarray(A, dtype=float)

    if x.shape != (3,):
        raise ValueError("Exactly three components are required.")

    if A.shape != (3, 3):
        raise ValueError("A must be a 3x3 matrix.")

    if not np.all(np.isfinite(x)) or np.any(x < 0):
        raise ValueError("Invalid mole fractions.")

    if not np.isclose(np.sum(x), 1.0, atol=1e-8):
        raise ValueError("Mole fractions must sum to one.")

    if not np.isfinite(T) or T <= 0:
        raise ValueError("Temperature must be positive.")

    if not np.isfinite(alpha) or alpha < 0:
        raise ValueError("Alpha must be non-negative.")

    tau = A / T
    G = np.exp(-alpha * tau)

    D = x @ G

    if np.any(D <= 0) or not np.all(np.isfinite(D)):
        raise ValueError("Invalid NRTL denominator.")

    ln_gamma = np.zeros(3)

    for i in range(3):

        term1 = 0.0
        term2 = 0.0

        for j in range(3):

            term1 += (
                x[j] * tau[j, i] * G[j, i] / D[i]
            )

            weighted_tau = np.sum(
                x * tau[:, j] * G[:, j]
            ) / D[j]

            term2 += (
                x[j] * G[i, j] / D[j]
                * (tau[i, j] - weighted_tau)
            )

        ln_gamma[i] = term1 + term2

    return np.exp(ln_gamma)


# ============================================================
# 2. FIXED-X2 COMPOSITIONS
#
# z = [z1, z2, z3]
#
# Phase 1:
# x1 = (1-x2) * sigmoid(z1)
# x2 = fixed
# x3 = (1-x2) * (1-sigmoid(z1))
#
# Phase 2:
# softmax([z2, z3, 0])
# ============================================================

def get_compositions_fixed(z, x2):

    z = np.asarray(z, dtype=float)

    fraction = expit(z[0])

    phase1 = np.array([
        (1.0 - x2) * fraction,
        x2,
        (1.0 - x2) * (1.0 - fraction)
    ])

    phase2 = softmax([
        z[1],
        z[2],
        0.0
    ])

    return phase1, phase2


# ============================================================
# 3. FOUR-DIMENSIONAL COMPOSITIONS
#
# q = [z1, z2, z3, z4]
#
# Phase 1: softmax([q0, q1, 0])
# Phase 2: softmax([q2, q3, 0])
# ============================================================

def get_compositions(q):

    q = np.asarray(q, dtype=float)

    phase1 = softmax([
        q[0],
        q[1],
        0.0
    ])

    phase2 = softmax([
        q[2],
        q[3],
        0.0
    ])

    return phase1, phase2


# ============================================================
# 4. CONVERT COMPOSITIONS TO LOGIT VARIABLES
# ============================================================

def compositions_to_q(phase1, phase2):

    phase1 = np.asarray(phase1, dtype=float)
    phase2 = np.asarray(phase2, dtype=float)

    eps = 1e-14

    phase1 = np.clip(phase1, eps, None)
    phase2 = np.clip(phase2, eps, None)

    phase1 /= np.sum(phase1)
    phase2 /= np.sum(phase2)

    return np.array([

        np.log(phase1[0] / phase1[2]),
        np.log(phase1[1] / phase1[2]),

        np.log(phase2[0] / phase2[2]),
        np.log(phase2[1] / phase2[2])

    ])


# ============================================================
# 5. FIXED-X2 EQUILIBRIUM OBJECTIVE
#
# Three unknowns and three equations.
# ============================================================


def objective_fixed(z, x2, T, A, alpha=ALPHA_DEFAULT):

    phase1, phase2 = get_compositions_fixed(z, x2)

    gamma1 = nrtl(phase1, T, A, alpha)
    gamma2 = nrtl(phase2, T, A, alpha)

    residual = (
        np.log(phase1) + np.log(gamma1)
        - np.log(phase2) - np.log(gamma2)
    )

    return residual


# ============================================================
# 6. FOUR-DIMENSIONAL EQUILIBRIUM OBJECTIVE
#
# Three logarithmic equilibrium equations.
# ============================================================

def objective(q, T, A, alpha=ALPHA_DEFAULT):

    phase1, phase2 = get_compositions(q)

    gamma1 = nrtl(phase1, T, A, alpha)
    gamma2 = nrtl(phase2, T, A, alpha)

    residual = (
        np.log(phase1) + np.log(gamma1)
        - np.log(phase2) - np.log(gamma2)
    )

    return residual



# ============================================================
# 7. EVALUATE SOLUTION
# ============================================================

def evaluate_solution(q, T, A, alpha=ALPHA_DEFAULT):

    q = np.asarray(q, dtype=float)

    phase1, phase2 = get_compositions(q)

    residual = np.linalg.norm(
        objective(q, T, A, alpha)
    )

    distance = np.linalg.norm(
        phase1 - phase2
    )

    return {

        "q": q,

        "X_P1": phase1,

        "X_P2": phase2,

        "residual": float(residual),

        "phase_distance": float(distance)

    }


# ============================================================
# 8. FIND FIRST NON-TRIVIAL LLE POINT
#
# x2 is fixed.
# Multiple starting guesses are tested.
# ============================================================

def calculate_initial_lle_point(
    x2,
    T,
    A,
    alpha=ALPHA_DEFAULT
):
    best_solution = None
    best_distance = -np.inf

    # Zuerst nur wenige Startwerte testen
    starts = [-4.0, -2.0, 0.0, 2.0, 4.0]

    def search(start_values):

        nonlocal best_solution, best_distance

        for a in start_values:
            for b in start_values:

                z0 = np.array([a, b, -b])

                try:
                    result = least_squares(
                        objective_fixed,
                        z0,
                        args=(x2, T, A, alpha),
                        max_nfev=MAX_NFEV,
                        xtol=1e-10,
                        ftol=1e-10,
                        gtol=1e-10
                    )

                    if not result.success:
                        continue

                    phase1, phase2 = get_compositions_fixed(
                        result.x, x2
                    )

                    residual = np.linalg.norm(
                        objective_fixed(
                            result.x, x2, T, A, alpha
                        )
                    )

                    distance = np.linalg.norm(phase1 - phase2)

                    if (
                        np.isfinite(residual)
                        and residual < RESIDUAL_TOL
                        and distance > 1e-5
                        and distance > best_distance
                    ):

                        q = compositions_to_q(phase1, phase2)

                        best_solution = evaluate_solution(
                            q, T, A, alpha
                        )

                        best_distance = distance

                except (
                    ValueError,
                    FloatingPointError,
                    OverflowError
                ):
                    continue

    # Schnelle Suche
    search(starts)

    # Nur wenn keine Lösung gefunden wurde:
    # umfangreichere Suche
    if best_solution is None:

        extended_starts = np.linspace(-8.0, 8.0, 9)

        search(extended_starts)

    return best_solution


# ============================================================
# 9. FIND SECOND INITIAL POINT
#
# x2 is fixed again.
# Three unknowns and three equations.
# ============================================================

def solve_initial_continuation_point(
    x2,
    previous,
    T,
    A,
    alpha=ALPHA_DEFAULT
):

    phase1_old = previous["X_P1"]
    phase2_old = previous["X_P2"]

    denominator = (
        phase1_old[0] + phase1_old[2]
    )

    if denominator <= 0:
        return None

    fraction_A = (
        phase1_old[0] / denominator
    )

    fraction_A = np.clip(
        fraction_A,
        1e-12,
        1.0 - 1e-12
    )

    phase2_old = np.clip(
        phase2_old,
        1e-12,
        None
    )

    phase2_old /= np.sum(phase2_old)

    z0 = np.array([

        np.log(
            fraction_A / (1.0 - fraction_A)
        ),

        np.log(
            phase2_old[0] / phase2_old[2]
        ),

        np.log(
            phase2_old[1] / phase2_old[2]
        )

    ])

    perturbations = [

        [0.0, 0.0, 0.0],

        [0.02, 0.02, 0.02],
        [-0.02, -0.02, -0.02],

        [0.05, -0.05, 0.05],
        [-0.05, 0.05, -0.05],

        [0.1, 0.0, -0.1],
        [-0.1, 0.0, 0.1]

    ]

    candidates = []

    for perturbation in perturbations:

        try:

            result = least_squares(

                objective_fixed,

                z0 + np.array(perturbation),

                args=(x2, T, A, alpha),

                max_nfev=MAX_NFEV,

                ftol=1e-12,
                xtol=1e-12,
                gtol=1e-12

            )

            if not result.success:
                continue

            phase1, phase2 = get_compositions_fixed(
                result.x,
                x2
            )

            residual = np.linalg.norm(
                objective_fixed(
                    result.x,
                    x2,
                    T,
                    A,
                    alpha
                )
            )

            distance = np.linalg.norm(
                phase1 - phase2
            )

            if (
                residual >= RESIDUAL_TOL
                or distance <= 1e-5
            ):

                continue

            q = compositions_to_q(
                phase1,
                phase2
            )

            candidate = evaluate_solution(
                q,
                T,
                A,
                alpha
            )

            continuity = (

                np.linalg.norm(
                    candidate["X_P1"] - phase1_old
                )

                +

                np.linalg.norm(
                    candidate["X_P2"] - phase2_old
                )

            )

            candidate["continuity"] = float(
                continuity
            )

            candidates.append(candidate)

        except (
            ValueError,
            FloatingPointError,
            OverflowError
        ):

            continue

    if not candidates:
        return None

    return min(
        candidates,
        key=lambda c: c["continuity"]
    )


# ============================================================
# 10. CALCULATE TANGENT
# ============================================================

def calculate_tangent(q_previous, q_current):

    tangent = (
        np.asarray(q_current, dtype=float)
        -
        np.asarray(q_previous, dtype=float)
    )

    norm = np.linalg.norm(tangent)

    if norm < 1e-14:
        raise ValueError(
            "Cannot calculate continuation tangent."
        )

    return tangent / norm


# ============================================================
# 11. PSEUDO-ARCLENGTH CORRECTOR
#
# Three equilibrium equations
# One arclength equation
#
# Four equations and four unknowns.
# ============================================================

def corrector_objective(
    q,
    q_predicted,
    tangent,
    T,
    A,
    alpha
):

    equilibrium = objective(
        q,
        T,
        A,
        alpha
    )

    arclength = np.dot(
        q - q_predicted,
        tangent
    )

    return np.concatenate([

        equilibrium,

        [arclength]

    ])


def pseudo_arclength_corrector(
    q_predicted,
    tangent,
    T,
    A,
    alpha=ALPHA_DEFAULT
):

    result = least_squares(

        corrector_objective,

        q_predicted,

        args=(

            q_predicted,
            tangent,
            T,
            A,
            alpha

        ),

        max_nfev=MAX_NFEV,

        xtol=1e-12,
        ftol=1e-12,
        gtol=1e-12

    )

    if not result.success:
        return None, result.nfev

    candidate = evaluate_solution(
        result.x,
        T,
        A,
        alpha
    )

    if (
        not np.isfinite(candidate["residual"])
        or candidate["residual"] > RESIDUAL_TOL
    ):

        return None, result.nfev

    return candidate, result.nfev


# ============================================================
# 12. PSEUDO-ARCLENGTH CONTINUATION
# ============================================================

def continue_binodal(
    first,
    second,
    T,
    A,
    alpha=ALPHA_DEFAULT,
    max_points=MAX_POINTS,
    initial_step=INITIAL_ARC_STEP
):

    points = [first, second]

    q_previous = first["q"]
    q_current = second["q"]

    tangent = calculate_tangent(
        q_previous,
        q_current
    )

    step_size = initial_step

    # Tracking des Minimums der Phasendistanz
    min_distance = min(
        first["phase_distance"],
        second["phase_distance"]
    )

    min_distance_index = (
        0 if first["phase_distance"] <= second["phase_distance"]
        else 1
    )

    # Anzahl aufeinanderfolgender Punkte oberhalb
    # des bisherigen Minimums
    increasing_count = 0

    # Toleranz gegen numerisches Rauschen
    DISTANCE_RISE_TOL = 2e-5

    # Mehrere Punkte müssen den Anstieg bestätigen
    REQUIRED_RISING_POINTS = 3

    for iteration in range(max_points - 2):

        success = False

        for attempt in range(15):

            q_predicted = (
                q_current + step_size * tangent
            )

            candidate, nfev = pseudo_arclength_corrector(
                q_predicted,
                tangent,
                T,
                A,
                alpha
            )

            if candidate is not None:
                success = True
                break

            step_size *= 0.5

            if step_size < MIN_ARC_STEP:
                break

        if not success:
            break

        q_new = candidate["q"]

        new_tangent = calculate_tangent(
            q_current,
            q_new
        )

        # Orientierung der Tangente beibehalten
        if np.dot(new_tangent, tangent) < 0:
            new_tangent *= -1.0

        phase_distance = candidate["phase_distance"]

        points.append(candidate)

        # ------------------------------------------------
        # PHASE MERGER UND DISTANZANSTIEG ERKENNEN
        # ------------------------------------------------

        if phase_distance < min_distance - DISTANCE_RISE_TOL:

            min_distance = phase_distance
            min_distance_index = len(points) - 1

            increasing_count = 0

        elif phase_distance > min_distance + DISTANCE_RISE_TOL:

            increasing_count += 1

        else:

            # Innerhalb der Toleranz: kein bestätigter Anstieg
            increasing_count = 0

        if increasing_count >= REQUIRED_RISING_POINTS:


            # Alle Punkte nach dem Minimum entfernen
            points = points[:min_distance_index + 1]

            break

        # ------------------------------------------------
        # PHASE MERGER
        # ------------------------------------------------

        if phase_distance < PHASE_DISTANCE_TOL:



            break

        # ------------------------------------------------
        # UPDATE CONTINUATION
        # ------------------------------------------------

        q_previous = q_current
        q_current = q_new

        tangent = new_tangent

        # ------------------------------------------------
        # ADAPT STEP SIZE
        # ------------------------------------------------

        if nfev < 20:

            step_size = min(
                step_size * 1.2,
                MAX_ARC_STEP
            )

        elif nfev > 100:

            step_size = max(
                step_size * 0.7,
                MIN_ARC_STEP
            )

    return points


# ============================================================
# 13. CALCULATE COMPLETE BINODAL
# ============================================================

def calculate_binodal(
    T,
    A,
    alpha=ALPHA_DEFAULT,
    n_points=MAX_POINTS,
    x2_min=0.001,
    x2_max=0.99
):

    if n_points < 3:
        raise ValueError(
            "n_points must be at least 3."
        )

    if not 0.0 < x2_min < x2_max < 1.0:
        raise ValueError(
            "Invalid x2 range."
        )


    # --------------------------------------------------------
    # 1. Find first non-trivial point
    # --------------------------------------------------------

    initial_values = np.linspace(
        x2_min,
        x2_max,
        40
    )

    first = None
    first_x2 = None

    for x2 in initial_values:


        try:

            candidate = calculate_initial_lle_point(

                x2=float(x2),

                T=T,
                A=A,
                alpha=alpha

            )

            if candidate is not None:

                first = candidate
                first_x2 = float(x2)

                break

        except (
            ValueError,
            FloatingPointError,
            OverflowError
        ):
            continue

    if first is None:
        raise ValueError(
            "No initial non-trivial LLE solution found."
        )

    # --------------------------------------------------------
    # 2. Find second point
    # --------------------------------------------------------

    second = None

    initial_dx = INITIAL_STEP_X2

    for attempt in range(8):

        second_x2 = min(
            first_x2 + initial_dx,
            x2_max
        )

        if second_x2 <= first_x2:
            break

        second = solve_initial_continuation_point(

            x2=second_x2,

            previous=first,

            T=T,
            A=A,
            alpha=alpha

        )

        if second is not None:

            break

        initial_dx *= 2.0

    if second is None:

        raise ValueError(
            "Could not find the second point for continuation."
        )

    # --------------------------------------------------------
    # 3. Pseudo-arclength continuation
    # --------------------------------------------------------

    points = continue_binodal(

        first=first,
        second=second,

        T=T,
        A=A,
        alpha=alpha,

        max_points=n_points,

        initial_step=INITIAL_ARC_STEP

    )

   
    # --------------------------------------------------------
    # 4. PREPARE OUTPUT
    # --------------------------------------------------------

    X_P1 = [
        point["X_P1"].tolist()
        for point in points
    ]

    X_P2 = [
        point["X_P2"].tolist()
        for point in points
    ]

    x2_values = [
        float(point["X_P1"][1])
        for point in points
    ]

    residuals = [
        float(point["residual"])
        for point in points
    ]

    distances = [
        float(point["phase_distance"])
        for point in points
    ]

    # --------------------------------------------------------
    # 5. ESTIMATE PLAIT POINT
    # --------------------------------------------------------

    if len(points) == 0:
        raise ValueError(
            "No valid binodal points were calculated."
        )

    last_phase1 = np.asarray(
        points[-1]["X_P1"],
        dtype=float
    )

    last_phase2 = np.asarray(
        points[-1]["X_P2"],
        dtype=float
    )

    # Approximation using the midpoint of the last
    # calculated phase compositions.
    X_PP = (last_phase1 + last_phase2) / 2.0

    # Normalize against numerical rounding errors.
    X_PP = X_PP / np.sum(X_PP)

    final_phase_distance = float(
        np.linalg.norm(last_phase1 - last_phase2)
    )

    plait_point_converged = (
        final_phase_distance < PHASE_DISTANCE_TOL
    )

    return {
        "X_P1": X_P1,
        "X_P2": X_P2,

        # Plait Point under both names
        "X_PP": X_PP.tolist(),
        "plait_point": X_PP.tolist(),

        "x2_values": x2_values,
        "residuals": residuals,
        "phase_distances": distances,

        "plait_point_converged": plait_point_converged,
        "plait_point_distance": final_phase_distance
    }

