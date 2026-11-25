import math


def saturation_pressure(a, b, c, temperature):
    """
    Sättigungsdampfdruck nach Antoine.

    Temperatur: °C
    Ergebnis: mmHg
    """
    return 10 ** (a - b / (c + temperature))


def boiling_temperature(a, b, c, pressure):
    """
    Siedetemperatur nach Antoine.

    pressure wird in mmHg erwartet.
    Ergebnis: °C
    """
    if pressure <= 0:
        raise ValueError("Der Druck muss positiv sein.")

    return b / (a - math.log10(pressure)) - c