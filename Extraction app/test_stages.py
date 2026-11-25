
import numpy as np

from calculations.lle import calculate_binodal
from calculations.parameters import get_parameters

from calculations.stages import (
    Fun_LLE_x,
    Fun_LLE_y,
    Fun_LLE_Y,
    intersect_twoLines,
    RE_phases,
    tangent
)


# --------------------------------------------------
# Eingabedaten
# --------------------------------------------------

mixture = "acetone-water-toluene"
temperature = 303.15

A, alpha = get_parameters(mixture)

result = calculate_binodal(
    T=temperature,
    A=A,
    alpha=alpha
)

X_P1 = np.asarray(result["X_P1"], dtype=float)
X_P2 = np.asarray(result["X_P2"], dtype=float)
X_PP = np.asarray(result["plait_point"], dtype=float)


# --------------------------------------------------
# Test 1: Binodale
# --------------------------------------------------

print("\n--- Binodale ---")
print("Anzahl Bindelinien:", len(X_P1))
print("X_P1 Anfang:", X_P1[0])
print("X_P1 Ende:", X_P1[-1])
print("X_P2 Anfang:", X_P2[0])
print("X_P2 Ende:", X_P2[-1])
print("Plait Point:", X_PP)


# --------------------------------------------------
# Test 2: Fun_LLE_x
# --------------------------------------------------

print("\n--- Fun_LLE_x ---")

index = len(X_P1) // 2
xA = X_P1[index, 2]

X, Y = Fun_LLE_x(xA, X_P1, X_P2)

print("Eingabe xA:", xA)
print("Interpoliertes X:", X)
print("Interpoliertes Y:", Y)
print("Summe X:", X.sum())
print("Summe Y:", Y.sum())


# --------------------------------------------------
# Test 3: Fun_LLE_y
# --------------------------------------------------

print("\n--- Fun_LLE_y ---")

index = len(X_P2) // 2
yA = X_P2[index, 2]

X, Y = Fun_LLE_y(yA, X_P1, X_P2)

print("Eingabe yA:", yA)
print("Interpoliertes X:", X)
print("Interpoliertes Y:", Y)
print("Summe X:", X.sum())
print("Summe Y:", Y.sum())


# --------------------------------------------------
# Test 4: Fun_LLE_Y
# --------------------------------------------------

print("\n--- Fun_LLE_Y ---")

X_recovered = Fun_LLE_Y(Y, X_P1, X_P2)

print("Ursprüngliches X:", X)
print("Wiedergefundenes X:", X_recovered)
print(
    "Abweichung:",
    np.linalg.norm(X - X_recovered)
)


# --------------------------------------------------
# Test 5: RE_phases
# --------------------------------------------------

print("\n--- RE_phases ---")

# Einen bekannten Mischpunkt auf einer Bindelinie erzeugen
fraction = 0.5
X_M = fraction * X + (1 - fraction) * Y

print("Mischpunkt:", X_M)
X_R, Y_E, R, E = RE_phases(1,
    X_M,
    X_P1,
    X_P2
)


print("Raffinat:", X_R)
print("Extrakt:", Y_E)
print("R:", R)
print("E:", E)
print("R + E:", R + E)

X_reconstructed = R * X_R + E * Y_E

print("Rekonstruierter Mischpunkt:", X_reconstructed)
print(
    "Bilanzabweichung:",
    np.linalg.norm(X_M - X_reconstructed)
)


# --------------------------------------------------
# Test 6: Tangente
# --------------------------------------------------

print("\n--- tangent ---")

Y_S = np.array([0.3, 0, 0.7])

X_Lim3, X_tangent = tangent(
    Y_S,
    X_P1,
    X_P2
)
print("Solvent-Punkt:", Y_S)
print("Tangenten-Schnittpunkt:", X_tangent)
print("Lim:", X_Lim3)
