
import numpy as np


def cartesian2trilinear(x, y):
    """
    Cartesian -> ternary coordinates.

    Output order: [A, B, C]
    """

    c = np.asarray(y, dtype=float) / np.sin(np.deg2rad(60))
    b = np.asarray(x, dtype=float) - 0.5 * c
    a = 1.0 - b - c

    return np.stack((a, b, c), axis=-1)


def trilinear2cartesian(X):
    """
    Ternary -> Cartesian coordinates.

    Input order: [A, B, C]
    """

    X = np.asarray(X, dtype=float)

    a = X[..., 0]
    b = X[..., 1]
    c = X[..., 2]

    x = b + 0.5 * c
    y = c * np.sin(np.deg2rad(60))

    return np.stack((x, y), axis=-1)


def pol3(xy1, xy2, m1, m2):
    """
    Cubic polynomial through two points with prescribed slopes.

    y = a*x^3 + b*x^2 + c*x + d
    """

    x1, y1 = np.asarray(xy1, dtype=float)
    x2, y2 = np.asarray(xy2, dtype=float)

    dx = x1 - x2

    if np.isclose(dx, 0):
        raise ValueError("The points must have different x coordinates.")

    a = ((m1 + m2) * dx - 2 * (y1 - y2)) / dx**3

    b = (
        m1 - m2 - 3 * (x1**2 - x2**2) * a
    ) / (2 * dx)

    c = m1 - 2 * x1 * b - 3 * x1**2 * a

    d = y1 - x1*c - x1**2*b - x1**3*a

    return np.array([a, b, c, d])


def evaluate_pol3(x, coeff):
    """Evaluate cubic polynomial."""

    a, b, c, d = coeff

    return a*x**3 + b*x**2 + c*x + d
