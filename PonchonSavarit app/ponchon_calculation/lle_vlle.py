import numpy as np


def calculate_lle_vlle(pressure, params, t_lle_min):
    """
    Calculates VLLE and LLE for the Water-1-Butanol mixture.
    The calculation follows the original MATLAB implementation.
    """

    # Pressure conversion: bar to mmHg
    p = pressure * 760 / 1.013

    # Antoine parameters
    a_e = params["a_e"]
    a_w = params["a_w"]
    b_e = params["b_e"]
    b_w = params["b_w"]
    c_e = params["c_e"]
    c_w = params["c_w"]

    # NRTL parameters
    g12_g22 = params["g12_g22"]
    g21_g11 = params["g21_g11"]
    alpha = params["alpha"]

    # Antoine equation
    def p_antoine(a, b, c, T):
        return 10 ** (a - b / (c + T))

    # Activity coefficients
    def gamma_n(x1, T):
        R = 8.314
        x2 = 1 - x1


        tau_12 = g12_g22 / (R * T)
        tau_21 = g21_g11 / (R * T)

        G12 = np.exp(-alpha * tau_12)
        G21 = np.exp(-alpha * tau_21)

        gamma = np.zeros(2)

        gamma[0] = np.exp(
            x2**2 * (
                (tau_12 * G12) / (x2 + x1 * G12)**2
                + (tau_21 * G21**2) / (x1 + x2 * G21)**2
            )
        )

        gamma[1] = np.exp(
            x1**2 * (
                (tau_12 * G12**2) / (x2 + x1 * G12)**2
                + (tau_21 * G21) / (x1 + x2 * G21)**2
            )
        )

        return gamma

    # Differentiation of activity coefficients
    # Original MATLAB implementation
    def diff_g_x(x, T, gamma_1, gamma_2):
        R = 8.314


        tau_12 = g12_g22 / (R * T)
        tau_21 = g21_g11 / (R * T)

        G_12 = np.exp(-alpha * tau_12)
        G_21 = np.exp(-alpha * tau_21)

        diff_g = np.zeros(2)

        diff_g[0] = gamma_1 * (
            -2 * (1 - x) * (
                tau_12 * G_12 / (1 - (1 - G_12) * x)**2
                + tau_21 * G_21**2 / (
                    G_21 + (1 - G_21) * x
                )**2
            )
            + 2 * (1 - x)**2 * (
                tau_12 * G_12 * (1 - G_12)
                / (1 - (1 - G_12) * x)**3
                - tau_21 * G_21**2 * (1 - G_21)
                / (G_21 + (1 - G_21) * x)**3
            )
        )

        diff_g[1] = gamma_2 * (
            2 * x * (
                tau_12 * G_12**2
                / (1 - (1 - G_12) * x)**2
                + tau_21 * G_21
                / (G_21 + (1 - G_21) * x)**2
            )
            + 2 * x**2 * (
                tau_12 * G_12**2 * (1 - G_12)
                / (1 - (1 - G_12) * x)**3
                - tau_21 * G_21 * (1 - G_21)
                / (G_21 + (1 - G_21) * x)**3
            )
        )

        return diff_g

    # --------------------------------------------------
    # VLLE calculation
    # --------------------------------------------------

    abr_I = 1
    X = np.array([1.0, 0.0])
    T_LL = 95.0

    for _temperature_iteration in range(200):
        if abs(abr_I) <= 1e-8:
            break

        psat_B = (
            p_antoine(a_w, b_w, c_w, T_LL) * 1.013 / 760
        )

        psat_W = (
            p_antoine(a_e, b_e, c_e, T_LL) * 1.013 / 760
        )

        abr_II = 1

        for _iteration in range(200):
            if abs(abr_II) <= 1e-9:
                break

            # Activity coefficients in both liquid phases
            g_L1 = gamma_n(X[0], T_LL)
            g_L2 = gamma_n(X[1], T_LL)

            # Equilibrium equations
            f_1 = g_L1[0] * X[0] - g_L2[0] * X[1]
            f_2 = (
                g_L1[1] * (1 - X[0])
                - g_L2[1] * (1 - X[1])
            )

            # Differentiation
            diffg_L1 = diff_g_x(
                X[0], T_LL, g_L1[0], g_L1[1]
            )

            diffg_L2 = diff_g_x(
                X[1], T_LL, g_L2[0], g_L2[1]
            )

            # Jacobian matrix
            J = np.zeros((2, 2))

            J[0, 0] = g_L1[0] + diffg_L1[0] * X[0]
            J[0, 1] = -g_L2[0] - diffg_L2[0] * X[1]

            J[1, 0] = -g_L1[1] + diffg_L1[1] * (1 - X[0])
            J[1, 1] = g_L2[1] - diffg_L2[1] * (1 - X[1])

            abr_II = X[0]

            F = np.array([f_1, f_2])

            X = X - np.linalg.solve(J, F)

            abr_II = abs(X[0] - abr_II) / abr_II

        # Temperature calculation
        f = (
            p * 1.013 / 760
            - X[0] * g_L1[0] * psat_W
            - (1 - X[0]) * g_L1[1] * psat_B
        )

        diff_f = (
            -X[0] * g_L1[0] * psat_W
            * np.log(10) * b_e / (c_e + T_LL)**2
            - (1 - X[0]) * g_L1[1] * np.log(10)
            * b_w / (c_w + T_LL)**2
        )

        if not np.isfinite(diff_f) or abs(diff_f) < 1e-14:
            raise ArithmeticError("VLLE temperature derivative is invalid.")

        abr_I = abs((f / diff_f) * (1 / T_LL))
        T_LL = T_LL - f / diff_f
        if not np.isfinite(T_LL):
            raise ArithmeticError("VLLE temperature iteration became invalid.")
    else:
        raise ArithmeticError("VLLE temperature iteration did not converge.")

    # Recalculate final liquid activity coefficients at converged temperature.
    g_L1 = gamma_n(X[0], T_LL)

    # Vapor phase at VLLE
    y_vlle = X[0] * g_L1[0] * psat_W / (p * 1.013 / 760)

    x_vlle = X.copy()
    t_vlle = T_LL

    # --------------------------------------------------
    # LLE calculation at different temperatures
    # --------------------------------------------------

    # LLE temperature range down to the lowest subcooled isotherm
    T = np.linspace(T_LL, t_lle_min, 50)

    X_LL = np.zeros((2, len(T)))

    for i in range(len(T)):

        if i == 0:
            X_LL[:, i] = [1, 0]
        else:
            X_LL[:, i] = X_LL[:, i - 1]

        abr = 1

        for _lle_iteration in range(200):
            if abs(abr) <= 1e-9:
                break

            g_L1 = gamma_n(X_LL[0, i], T[i])
            g_L2 = gamma_n(X_LL[1, i], T[i])

            f_1 = (
                g_L1[0] * X_LL[0, i]
                - g_L2[0] * X_LL[1, i]
            )

            f_2 = (
                g_L1[1] * (1 - X_LL[0, i])
                - g_L2[1] * (1 - X_LL[1, i])
            )

            diffg_L1 = diff_g_x(
                X_LL[0, i], T[i], g_L1[0], g_L1[1]
            )

            diffg_L2 = diff_g_x(
                X_LL[1, i], T[i], g_L2[0], g_L2[1]
            )

            J = np.zeros((2, 2))

            J[0, 0] = (
                g_L1[0] + diffg_L1[0] * X_LL[0, i]
            )

            J[0, 1] = (
                -g_L2[0] - diffg_L2[0] * X_LL[1, i]
            )

            J[1, 0] = (
                -g_L1[1] + diffg_L1[1] * (1 - X_LL[0, i])
            )

            J[1, 1] = (
                g_L2[1] - diffg_L2[1] * (1 - X_LL[1, i])
            )

            abr = X_LL[0, i]

            F = np.array([f_1, f_2])

            X_LL[:, i] = (
                X_LL[:, i] - np.linalg.solve(J, F)
            )

            abr = abs(X_LL[0, i] - abr) / max(abs(abr), 1e-12)

            if (not np.all(np.isfinite(X_LL[:, i]))
                    or np.any(X_LL[:, i] < 0)
                    or np.any(X_LL[:, i] > 1)):
                raise ArithmeticError("LLE liquid-phase iteration became invalid.")
        else:
            raise ArithmeticError("LLE Newton iteration did not converge.")

    return {
        "x_vlle": x_vlle.tolist(),
        "y_vlle": float(y_vlle),
        "t_vlle": float(t_vlle),
        "x_lle": X_LL.tolist(),
        "t_lle": T.tolist()
    }