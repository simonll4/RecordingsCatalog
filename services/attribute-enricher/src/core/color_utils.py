"""
Utility functions for color manipulation and analysis.

This module provides a set of pure‑Python helpers for converting between
different colour spaces, performing basic image enhancement and
extracting colour statistics.  The implementation deliberately avoids
dependencies that may not be available in restricted environments (such
as OpenCV or scikit‑image) and relies only on the Python standard
library, NumPy and Pillow.  These helpers are used by the
``ColorAttributeProvider`` to perform colour clustering and naming.

Features implemented here include:

* Gamma correction to compensate for global illumination.
* Simple histogram equalisation to improve contrast.
* Conversion between RGB, HSV and CIE Lab colour spaces.
* Computation of the CIEDE2000 Delta E perceptual distance metric.
* Generation of elliptical masks and soft masks for crops without a
  segmentation mask.

Note that because we avoid heavy dependencies, the algorithms
implemented here may not be as fast as highly optimised libraries.
However, they have been written with vectorised NumPy operations where
possible to achieve reasonable performance.
"""

from __future__ import annotations

import math
from typing import Tuple, Optional

import numpy as np
from PIL import Image, ImageFilter, ImageOps
try:  # optional; used for faster mask morphology if available
    import cv2  # type: ignore
except Exception:  # pragma: no cover - optional dependency here
    cv2 = None  # type: ignore

###############################################################################
# Enhancement utilities
###############################################################################

def apply_gamma(image: np.ndarray, gamma: float = 1.0) -> np.ndarray:
    """Apply gamma correction to an RGB image.

    Parameters
    ----------
    image : np.ndarray
        Input image as a floating point array in the range [0, 1].
    gamma : float, optional
        Gamma value to apply.  A value < 1 brightens the image and
        > 1 darkens it.  The default is 1.0 (no change).

    Returns
    -------
    np.ndarray
        Gamma corrected image in the range [0, 1].
    """
    if gamma <= 0:
        raise ValueError("Gamma must be positive")
    return np.clip(image ** (1.0 / gamma), 0.0, 1.0)


def equalize_histogram(image: np.ndarray) -> np.ndarray:
    """Perform simple histogram equalisation on an RGB image.

    This function operates on each channel independently.  It uses
    Pillow's histogram equalisation implementation under the hood
    (``ImageOps.equalize``) and then converts the result back to a
    NumPy array.

    Parameters
    ----------
    image : np.ndarray
        Input image as a floating point array in the range [0, 1].

    Returns
    -------
    np.ndarray
        Equalised image in the range [0, 1].
    """
    img = Image.fromarray(np.clip(image * 255.0, 0, 255).astype("uint8"))
    # Split channels and equalise each separately for better colour balance
    channels = img.split()
    eq_channels = [ImageOps.equalize(c) for c in channels]
    eq_img = Image.merge("RGB", eq_channels)
    return np.asarray(eq_img, dtype=np.float32) / 255.0


def apply_gaussian_blur(image: np.ndarray, radius: float = 0.0) -> np.ndarray:
    """Apply a light Gaussian blur using Pillow.

    Parameters
    ----------
    image : np.ndarray
        RGB image in [0,1].
    radius : float
        Blur radius in pixels. Values in [0.5, 2] are reasonable for
        noise suppression. If <= 0, returns the image unchanged.
    """
    if radius and radius > 0:
        img = Image.fromarray(np.clip(image * 255.0, 0, 255).astype("uint8"))
        img = img.filter(ImageFilter.GaussianBlur(radius=radius))
        return np.asarray(img, dtype=np.float32) / 255.0
    return image


def white_balance_grey_world(image: np.ndarray) -> np.ndarray:
    """Simple grey‑world white balance.

    Scales each RGB channel so that their means are equal. Helps reduce
    colour cast from illumination.
    """
    eps = 1e-6
    means = image.reshape(-1, 3).mean(axis=0) + eps
    scale = means.mean() / means
    balanced = np.clip(image * scale[None, None, :], 0.0, 1.0)
    return balanced


###############################################################################
# Colour space conversions
###############################################################################

def rgb_to_hsv(rgb: np.ndarray) -> np.ndarray:
    """Convert an array of RGB values to HSV.

    The input array should have shape (N, 3) with values in the range
    [0, 1].  The output has the same shape and contains hue in degrees
    [0, 360), saturation and value in [0, 1].  This implementation
    operates on arrays of arbitrary length using vectorised operations.
    """
    r = rgb[:, 0]
    g = rgb[:, 1]
    b = rgb[:, 2]
    cmax = np.max(rgb, axis=1)
    cmin = np.min(rgb, axis=1)
    delta = cmax - cmin

    # Hue calculation
    h = np.zeros_like(cmax)
    mask = delta > 0
    # Avoid division by zero by only computing where delta > 0
    idx = (cmax == r) & mask
    h[idx] = 60 * (((g[idx] - b[idx]) / delta[idx]) % 6)
    idx = (cmax == g) & mask
    h[idx] = 60 * (((b[idx] - r[idx]) / delta[idx]) + 2)
    idx = (cmax == b) & mask
    h[idx] = 60 * (((r[idx] - g[idx]) / delta[idx]) + 4)
    # Saturation
    s = np.zeros_like(cmax)
    s[cmax != 0] = delta[cmax != 0] / cmax[cmax != 0]
    # Value
    v = cmax
    return np.stack([h, s, v], axis=1)


def hsv_to_rgb(hsv: np.ndarray) -> np.ndarray:
    """Convert an array of HSV values to RGB.

    Input hue is expected in degrees [0, 360).  Saturation and value
    should lie in [0, 1].  Output is in the range [0, 1].
    """
    h = hsv[:, 0] / 60.0  # convert degrees to [0,6)
    s = hsv[:, 1]
    v = hsv[:, 2]
    c = s * v
    x = c * (1 - np.abs((h % 2) - 1))
    m = v - c
    rgb = np.zeros((h.size, 3), dtype=np.float32)
    idx = (h >= 0) & (h < 1)
    rgb[idx] = np.stack([c[idx], x[idx], np.zeros_like(c[idx])], axis=1)
    idx = (h >= 1) & (h < 2)
    rgb[idx] = np.stack([x[idx], c[idx], np.zeros_like(c[idx])], axis=1)
    idx = (h >= 2) & (h < 3)
    rgb[idx] = np.stack([np.zeros_like(c[idx]), c[idx], x[idx]], axis=1)
    idx = (h >= 3) & (h < 4)
    rgb[idx] = np.stack([np.zeros_like(c[idx]), x[idx], c[idx]], axis=1)
    idx = (h >= 4) & (h < 5)
    rgb[idx] = np.stack([x[idx], np.zeros_like(c[idx]), c[idx]], axis=1)
    idx = (h >= 5) & (h < 6)
    rgb[idx] = np.stack([c[idx], np.zeros_like(c[idx]), x[idx]], axis=1)
    return np.clip(rgb + m[:, None], 0.0, 1.0)


def _pivot_rgb_to_xyz(channel: np.ndarray) -> np.ndarray:
    """Helper for RGB→XYZ conversion using sRGB standards."""
    # Linearise sRGB values
    mask = channel > 0.04045
    linear = np.empty_like(channel)
    linear[mask] = ((channel[mask] + 0.055) / 1.055) ** 2.4
    linear[~mask] = channel[~mask] / 12.92
    return linear


def rgb_to_xyz(rgb: np.ndarray) -> np.ndarray:
    """Convert an array of sRGB values (0..1) to CIE XYZ (range roughly 0..1)."""
    rgb_lin = _pivot_rgb_to_xyz(rgb)
    # sRGB to XYZ matrix (D65 reference white)
    M = np.array([
        [0.4124564, 0.3575761, 0.1804375],
        [0.2126729, 0.7151522, 0.0721750],
        [0.0193339, 0.1191920, 0.9503041],
    ])
    return np.dot(rgb_lin, M.T)


def _pivot_xyz_to_lab(t: np.ndarray) -> np.ndarray:
    """Helper for XYZ→Lab conversion."""
    delta = 6 / 29
    mask = t > delta ** 3
    f = np.empty_like(t)
    f[mask] = np.cbrt(t[mask])
    f[~mask] = (t[~mask] / (3 * delta ** 2)) + (4 / 29)
    return f


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    """Convert an array of sRGB values (0..1) to CIE Lab (L*, a*, b*)."""
    xyz = rgb_to_xyz(rgb)
    # D65 reference white point
    white = np.array([0.95047, 1.00000, 1.08883])
    xyz_norm = xyz / white
    f = _pivot_xyz_to_lab(xyz_norm)
    L = (116 * f[:, 1]) - 16
    a = 500 * (f[:, 0] - f[:, 1])
    b = 200 * (f[:, 1] - f[:, 2])
    return np.stack([L, a, b], axis=1)


def _pivot_lab_to_xyz(f: np.ndarray) -> np.ndarray:
    """Helper for Lab→XYZ conversion."""
    delta = 6 / 29
    mask = f > delta
    t = np.empty_like(f)
    t[mask] = f[mask] ** 3
    t[~mask] = 3 * delta ** 2 * (f[~mask] - 4 / 29)
    return t


def lab_to_rgb(lab: np.ndarray) -> np.ndarray:
    """Convert an array of CIE Lab values to sRGB (0..1)."""
    L = lab[:, 0]
    a = lab[:, 1]
    b = lab[:, 2]
    fy = (L + 16) / 116
    fx = fy + (a / 500)
    fz = fy - (b / 200)
    # Convert to XYZ
    xyz = np.stack([_pivot_lab_to_xyz(fx), _pivot_lab_to_xyz(fy), _pivot_lab_to_xyz(fz)], axis=1)
    # Scale by reference white (D65)
    white = np.array([0.95047, 1.00000, 1.08883])
    xyz *= white
    # XYZ to linear RGB
    M_inv = np.array([
        [ 3.2404542, -1.5371385, -0.4985314],
        [-0.9692660,  1.8760108,  0.0415560],
        [ 0.0556434, -0.2040259,  1.0572252],
    ])
    rgb_lin = np.dot(xyz, M_inv.T)
    # Apply gamma correction
    threshold = 0.0031308
    rgb = np.empty_like(rgb_lin)
    mask = rgb_lin > threshold
    rgb[mask] = 1.055 * (rgb_lin[mask] ** (1 / 2.4)) - 0.055
    rgb[~mask] = 12.92 * rgb_lin[~mask]
    return np.clip(rgb, 0.0, 1.0)


###############################################################################
# Colour distance and naming
###############################################################################

def delta_e_ciede2000(lab1: np.ndarray, lab2: np.ndarray) -> np.ndarray:
    """Compute the CIEDE2000 colour difference between pairs of Lab colours.

    This implementation follows the algorithm described in "The CIEDE2000
    Color‐Difference Formula: Implementation Notes, Supplementary Test
    Data, and Mathematical Observations" by Gaurav Sharma et al.  It
    expects `lab1` and `lab2` arrays of the same shape (N×3) and returns
    an array of length N containing the perceptual distance for each
    pair.
    """
    # Convert to individual components
    L1, a1, b1 = lab1[:, 0], lab1[:, 1], lab1[:, 2]
    L2, a2, b2 = lab2[:, 0], lab2[:, 1], lab2[:, 2]
    # Mean L*
    L_ = (L1 + L2) / 2.0
    # Compute C* and h* for each colour
    C1 = np.sqrt(a1 ** 2 + b1 ** 2)
    C2 = np.sqrt(a2 ** 2 + b2 ** 2)
    C_ = (C1 + C2) / 2.0
    # Compute G factor to correct chroma
    G = 0.5 * (1 - np.sqrt((C_ ** 7) / (C_ ** 7 + 25 ** 7)))
    a1p = (1 + G) * a1
    a2p = (1 + G) * a2
    C1p = np.sqrt(a1p ** 2 + b1 ** 2)
    C2p = np.sqrt(a2p ** 2 + b2 ** 2)
    # Compute hue angles in degrees
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    # Compute delta L*, delta C*, delta H*
    dLp = L2 - L1
    dCp = C2p - C1p
    # Hue difference with proper handling of wrapping
    dhp = h2p - h1p
    dhp = np.where(dhp > 180, dhp - 360, dhp)
    dhp = np.where(dhp < -180, dhp + 360, dhp)
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dhp / 2.0))
    # Compute average metrics
    Lp_ = (L1 + L2) / 2.0
    Cp_ = (C1p + C2p) / 2.0
    # Compute average hue
    h_sum = h1p + h2p
    hp_ = np.where(
        (np.abs(h1p - h2p) > 180),
        (h_sum + 360) / 2.0,
        h_sum / 2.0,
    )
    # T factor
    T = (
        1
        - 0.17 * np.cos(np.radians(hp_ - 30))
        + 0.24 * np.cos(np.radians(2 * hp_))
        + 0.32 * np.cos(np.radians(3 * hp_ + 6))
        - 0.20 * np.cos(np.radians(4 * hp_ - 63))
    )
    # Compute SL, SC, SH
    dtheta = 30 * np.exp(-(((hp_ - 275) / 25) ** 2))
    RC = 2 * np.sqrt((Cp_ ** 7) / (Cp_ ** 7 + 25 ** 7))
    SL = 1 + (0.015 * ((Lp_ - 50) ** 2)) / np.sqrt(20 + (Lp_ - 50) ** 2)
    SC = 1 + 0.045 * Cp_
    SH = 1 + 0.015 * Cp_ * T
    RT = -RC * np.sin(2 * np.radians(dtheta))
    # Final delta E
    dE = np.sqrt(
        (dLp / SL) ** 2
        + (dCp / SC) ** 2
        + (dHp / SH) ** 2
        + RT * (dCp / SC) * (dHp / SH)
    )
    return dE


###############################################################################
# Mask generation utilities
###############################################################################

def create_elliptical_mask(size: Tuple[int, int], scale: float = 0.8) -> np.ndarray:
    """Create a soft elliptical mask centred in the image.

    Parameters
    ----------
    size : tuple of int
        The `(height, width)` of the mask to generate.
    scale : float, optional
        Relative size of the ellipse.  A value of 1 fills the image,
        smaller values produce a smaller ellipse.  Default is 0.8.

    Returns
    -------
    np.ndarray
        A binary mask where pixels inside the ellipse are ``True``.
    """
    h, w = size
    y, x = np.ogrid[:h, :w]
    cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
    ry, rx = (h * scale) / 2.0, (w * scale) / 2.0
    norm = ((y - cy) / ry) ** 2 + ((x - cx) / rx) ** 2
    return norm <= 1.0


def load_mask(mask_path: Optional[str], size: Tuple[int, int]) -> np.ndarray:
    """Load a mask image or generate a fallback elliptical mask.

    If ``mask_path`` is ``None`` or the image cannot be loaded, an
    elliptical mask covering 80 % of the crop is returned.  Otherwise
    the mask is loaded from the given path, converted to a boolean
    array and resized to match the expected size.
    """
    if mask_path is None:
        return create_elliptical_mask(size)
    try:
        m_img = Image.open(mask_path).convert("L").resize(size[::-1], Image.NEAREST)
        mask = np.asarray(m_img, dtype=np.uint8) > 128
        return mask
    except Exception:
        return create_elliptical_mask(size)


def erode_mask(mask: np.ndarray, ksize: int = 3, iterations: int = 1) -> np.ndarray:
    """Binary erosion for boolean masks.

    Uses OpenCV if available; otherwise falls back to a NumPy implementation.
    """
    if mask.size == 0:
        return mask
    if cv2 is not None:  # pragma: no cover - prefer fast path
        kernel = np.ones((ksize, ksize), np.uint8)
        m = (mask.astype(np.uint8) * 255)
        m = cv2.erode(m, kernel, iterations=max(1, int(iterations)))
        return m > 128
    # Fallback: NumPy sliding-window erosion
    k = max(1, int(ksize))
    if k % 2 == 0:
        k += 1
    h, w = mask.shape
    pad = k // 2
    out = mask.copy()
    for _ in range(max(1, int(iterations))):
        padded = np.pad(out, ((pad, pad), (pad, pad)), mode="constant", constant_values=False)
        # Compute local sums
        sums = np.zeros_like(out, dtype=np.int32)
        for dy in range(k):
            for dx in range(k):
                sums += padded[dy:dy + h, dx:dx + w]
        out = sums == (k * k)
    return out


def close_mask(mask: np.ndarray, ksize: int = 3, iterations: int = 1) -> np.ndarray:
    """Binary closing (dilation followed by erosion) to fill small holes."""
    if mask.size == 0:
        return mask
    if cv2 is not None:  # pragma: no cover
        kernel = np.ones((ksize, ksize), np.uint8)
        m = (mask.astype(np.uint8) * 255)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel, iterations=max(1, int(iterations)))
        return m > 128
    # Fallback: one dilation then erosion using simple max/min filters
    k = max(1, int(ksize))
    if k % 2 == 0:
        k += 1
    h, w = mask.shape
    pad = k // 2
    padded = np.pad(mask, ((pad, pad), (pad, pad)), mode="constant", constant_values=False)
    # Dilation
    dil = np.zeros_like(mask, dtype=bool)
    for dy in range(k):
        for dx in range(k):
            dil |= padded[dy:dy + h, dx:dx + w]
    # Erosion
    padded = np.pad(dil, ((pad, pad), (pad, pad)), mode="constant", constant_values=False)
    sums = np.zeros_like(mask, dtype=np.int32)
    for dy in range(k):
        for dx in range(k):
            sums += padded[dy:dy + h, dx:dx + w]
    return sums == (k * k)


###############################################################################
# Modifiers and temperature classification
###############################################################################

def classify_temperature(hue_deg: float) -> str:
    """Classify hue into a coarse temperature category.

    Parameters
    ----------
    hue_deg : float
        Hue angle in degrees (0 ≤ hue < 360).

    Returns
    -------
    str
        One of ``"warm"``, ``"cool"`` or ``"neutral"`` depending on
        hue.
    """
    if (hue_deg < 35) or (hue_deg >= 300):
        return "warm"
    if 35 <= hue_deg < 190:
        return "cool"
    return "neutral"


def classify_lightness(value: float) -> str:
    """Classify brightness into light/dark modifiers.

    Parameters
    ----------
    value : float
        Value component from HSV in [0, 1].

    Returns
    -------
    str
        ``"light"``, ``"dark"`` or ``"normal"``.
    """
    if value <= 0.25:
        return "dark"
    if value >= 0.75:
        return "light"
    return "normal"


def classify_saturation(sat: float) -> str:
    """Classify saturation into vivid/muted modifiers.

    Parameters
    ----------
    sat : float
        Saturation component from HSV in [0, 1].

    Returns
    -------
    str
        ``"vivid"``, ``"muted"`` or ``"normal"``.
    """
    if sat <= 0.2:
        return "muted"
    if sat >= 0.7:
        return "vivid"
    return "normal"

