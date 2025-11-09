"""
Colour attribute provider with clustering debug exports.

This provider analyses a detection crop, filters informative pixels,
clusters colours in CIE Lab space, selects a dominant cluster and maps
it to the nearest CSS3 colour name using the CIEDE2000 distance. It can
optionally export visual debug artefacts showing the clusters applied to
the crop and a palette bar per detection in a sibling ``clusters``
directory next to the detector's ``crops`` directory.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from PIL import Image, ImageDraw

from .. import color_utils as cu


# --- CSS3 colour palette (name -> RGB 0..1) ---------------------------------
# Subset covering common colours; can be extended if needed.
_CSS3_RGB: Dict[str, Tuple[float, float, float]] = {
    # Greyscale
    "black": (0.0, 0.0, 0.0),
    "dimgray": (0.4118, 0.4118, 0.4118),
    "gray": (0.5019, 0.5019, 0.5019),
    "darkgray": (0.6627, 0.6627, 0.6627),
    "silver": (0.7529, 0.7529, 0.7529),
    "gainsboro": (0.8627, 0.8627, 0.8627),
    "whitesmoke": (0.9607, 0.9607, 0.9607),
    "white": (1.0, 1.0, 1.0),
    # Reds
    "darkred": (0.545, 0.0, 0.0),
    "firebrick": (0.698, 0.133, 0.133),
    "crimson": (0.863, 0.078, 0.235),
    "indianred": (0.804, 0.361, 0.361),
    "red": (1.0, 0.0, 0.0),
    "salmon": (0.980, 0.502, 0.447),
    # Oranges / Browns
    "darkgoldenrod": (0.721, 0.525, 0.043),
    "goldenrod": (0.855, 0.647, 0.125),
    "orange": (1.0, 0.647, 0.0),
    "chocolate": (0.824, 0.412, 0.118),
    "saddlebrown": (0.545, 0.271, 0.075),
    "sienna": (0.627, 0.322, 0.176),
    "brown": (0.647, 0.165, 0.165),
    # Yellows
    "gold": (1.0, 0.843, 0.0),
    "khaki": (0.941, 0.902, 0.549),
    "darkkhaki": (0.741, 0.718, 0.420),
    # Greens
    "darkolivegreen": (0.333, 0.420, 0.184),
    "olivedrab": (0.420, 0.557, 0.137),
    "forestgreen": (0.133, 0.545, 0.133),
    "seagreen": (0.180, 0.545, 0.341),
    "green": (0.0, 0.502, 0.0),
    "springgreen": (0.0, 1.0, 0.498),
    "lime": (0.0, 1.0, 0.0),
    # Cyans / Teals
    "darkslategray": (0.184, 0.310, 0.310),
    "teal": (0.0, 0.502, 0.502),
    "lightseagreen": (0.125, 0.698, 0.667),
    "turquoise": (0.251, 0.878, 0.816),
    # Blues
    "steelblue": (0.275, 0.510, 0.706),
    "lightsteelblue": (0.690, 0.769, 0.871),
    "deepskyblue": (0.0, 0.749, 1.0),
    "dodgerblue": (0.118, 0.565, 1.0),
    "blue": (0.0, 0.0, 1.0),
    "navy": (0.0, 0.0, 0.502),
    # Purples / Pinks
    "indigo": (0.294, 0.0, 0.510),
    "rebeccapurple": (0.400, 0.200, 0.600),
    "purple": (0.502, 0.0, 0.502),
    "magenta": (1.0, 0.0, 1.0),
    "deeppink": (1.0, 0.078, 0.576),
}

_CSS3_LAB: Dict[str, np.ndarray] = {n: cu.rgb_to_lab(np.array([rgb], dtype=np.float32)).squeeze(0) for n, rgb in _CSS3_RGB.items()}


def _ensure_dir(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


def _family_from_hue(hue: float) -> str:
    """Coarse colour family from hue in degrees."""
    if hue < 15 or hue >= 345:
        return "red"
    if hue < 45:
        return "orange"
    if hue < 70:
        return "yellow"
    if hue < 170:
        return "green"
    if hue < 200:
        return "cyan"
    if hue < 255:
        return "blue"
    if hue < 290:
        return "purple"
    if hue < 330:
        return "pink"
    return "red"


def _base_color_name_from_hue(hue: float) -> str:
    """Get base color name in Spanish from hue in degrees."""
    if hue < 15 or hue >= 345:
        return "rojo"
    if hue < 25:
        return "rojo anaranjado"
    if hue < 45:
        return "naranja"
    if hue < 55:
        return "naranja amarillento"
    if hue < 70:
        return "amarillo"
    if hue < 80:
        return "amarillo verdoso"
    if hue < 150:
        return "verde"
    if hue < 170:
        return "verde azulado"
    if hue < 200:
        return "cian"
    if hue < 220:
        return "azul cian"
    if hue < 255:
        return "azul"
    if hue < 280:
        return "azul violeta"
    if hue < 310:
        return "violeta"
    if hue < 330:
        return "púrpura"
    if hue < 345:
        return "rosa"
    return "rojo"


def _generate_descriptive_name(rgb: np.ndarray) -> str:
    """Generate a descriptive color name in Spanish based on HSV properties.
    
    Parameters
    ----------
    rgb : np.ndarray
        RGB color in [0, 1] range, shape (3,)
    
    Returns
    -------
    str
        Descriptive color name in Spanish (e.g., "rojo brillante", "azul oscuro")
    """
    hsv = cu.rgb_to_hsv(rgb[None, :])[0]
    h, s, v = float(hsv[0]), float(hsv[1]), float(hsv[2])
    r, g, b = float(rgb[0]), float(rgb[1]), float(rgb[2])
    
    # Check for achromatic colors first
    if s < 0.1:
        if v < 0.15:
            return "negro"
        elif v < 0.35:
            return "gris muy oscuro"
        elif v < 0.5:
            return "gris oscuro"
        elif v < 0.65:
            return "gris"
        elif v < 0.8:
            return "gris claro"
        elif v < 0.92:
            return "gris muy claro"
        else:
            return "blanco"
    
    # Special cases for common colors
    # Brown: low saturation orange/red with low-medium value
    if 10 <= h < 55 and 0.2 < s < 0.7 and 0.2 < v < 0.7:
        if v < 0.35:
            return "marrón oscuro"
        elif v < 0.5:
            return "marrón"
        else:
            return "marrón claro"
    
    # Pink: high value, low-medium saturation in red/purple range
    if ((h < 15 or h >= 320) and v > 0.7 and s < 0.5) or (310 <= h < 350 and v > 0.65):
        if s < 0.2:
            return "rosa muy claro"
        elif s < 0.35:
            return "rosa claro"
        else:
            return "rosa"
    
    # Beige/cream: yellow-orange with low sat and high value
    if 35 <= h < 70 and s < 0.35 and v > 0.75:
        return "beige"
    
    # Get base color name
    base = _base_color_name_from_hue(h)
    
    # Build descriptive modifiers based on saturation and value
    modifiers = []
    
    # Lightness modifiers (based on value)
    if v < 0.25:
        modifiers.append("muy oscuro")
    elif v < 0.45:
        modifiers.append("oscuro")
    elif v > 0.85:
        if s < 0.3:
            modifiers.append("muy claro")
        else:
            modifiers.append("claro")
    elif v > 0.7 and s < 0.5:
        modifiers.append("claro")
    
    # Saturation modifiers
    if s < 0.2:
        modifiers.append("grisáceo")
    elif s < 0.4:
        modifiers.append("apagado")
    elif s > 0.8:
        modifiers.append("brillante")
    elif s > 0.6 and v > 0.5:
        modifiers.append("vivo")
    
    # Combine modifiers and base color
    if modifiers:
        return f"{base} {' '.join(modifiers)}"
    else:
        return base


def _rgb_to_hex(rgb: np.ndarray) -> str:
    """Convert RGB float array [0,1] to hex string.
    
    Parameters
    ----------
    rgb : np.ndarray
        RGB color in [0, 1] range, shape (3,)
    
    Returns
    -------
    str
        Hex color string (e.g., "#FF5733")
    """
    r = int(np.clip(rgb[0] * 255, 0, 255))
    g = int(np.clip(rgb[1] * 255, 0, 255))
    b = int(np.clip(rgb[2] * 255, 0, 255))
    return f"#{r:02X}{g:02X}{b:02X}"


def _compute_chroma(rgb: np.ndarray) -> np.ndarray:
    """Simple chroma proxy from RGB distance between channels."""
    r, g, b = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    return np.sqrt((r - g) ** 2 + (g - b) ** 2 + (b - r) ** 2)


def _kmeans_pp_init(X: np.ndarray, k: int, rng: np.random.RandomState) -> np.ndarray:
    n = X.shape[0]
    centers = np.empty((k, X.shape[1]), dtype=X.dtype)
    idx = rng.randint(0, n)
    centers[0] = X[idx]
    closest_dist_sq = np.full(n, np.inf, dtype=np.float32)
    for i in range(1, k):
        dists = np.sum((X - centers[i - 1]) ** 2, axis=1)
        closest_dist_sq = np.minimum(closest_dist_sq, dists)
        probs = closest_dist_sq / np.sum(closest_dist_sq)
        idx = rng.choice(n, p=probs)
        centers[i] = X[idx]
    return centers


def _kmeans(X: np.ndarray, k: int, n_init: int = 10, max_iter: int = 200, rng_seed: int = 42) -> Tuple[np.ndarray, np.ndarray, float]:
    """Simple K‑Means on rows of X.

    Returns (centers, labels, inertia).
    """
    rng = np.random.RandomState(rng_seed)
    best_inertia = np.inf
    best_centers = None
    best_labels = None
    for init in range(max(1, int(n_init))):
        centers = _kmeans_pp_init(X, k, rng)
        labels = np.zeros(X.shape[0], dtype=np.int32)
        for _ in range(max_iter):
            # Assign
            dists = np.linalg.norm(X[:, None, :] - centers[None, :, :], axis=2)  # (N,k)
            new_labels = np.argmin(dists, axis=1)
            if best_labels is not None and np.array_equal(new_labels, labels):
                break
            labels = new_labels
            # Update
            for i in range(k):
                pts = X[labels == i]
                if pts.size:
                    centers[i] = pts.mean(axis=0)
        # Inertia
        inertia = float(np.sum((X - centers[labels]) ** 2))
        if inertia < best_inertia:
            best_inertia = inertia
            best_centers = centers.copy()
            best_labels = labels.copy()
    assert best_centers is not None and best_labels is not None
    return best_centers, best_labels, float(best_inertia)


@dataclass
class ColorAttributeProvider:
    """Analyse crops to infer a perceptual colour and export cluster debug."""

    include_details: bool = False
    # Pixel filtering
    s_min: float = 0.05
    v_min: float = 0.02
    v_max: float = 0.98
    # Preprocessing
    gamma: float = 1.0
    equalize: bool = False
    white_balance: bool = True
    blur_radius: float = 1.0
    # Mask refinement
    mask_erode_px: int = 2
    # Clustering
    min_k: int = 1
    max_k: int = 3
    sample_pixels: int = 5000
    # Achromatic decision
    achro_s_th: float = 0.18
    achro_frac_th: float = 0.60
    white_v_th: float = 0.78
    white_v_strong_th: float = 0.90
    black_v_th: float = 0.25
    achro_margin: float = 0.08
    # Debug exports
    save_cluster_images: bool = False
    # Color naming
    use_css3_names: bool = False  # If True, map to CSS3 names; if False, use descriptive names

    def _preprocess(self, rgb: np.ndarray) -> np.ndarray:
        img = rgb
        if self.white_balance:
            img = cu.white_balance_grey_world(img)
        if abs(self.gamma - 1.0) > 1e-3:
            img = cu.apply_gamma(img, gamma=self.gamma)
        if self.equalize:
            img = cu.equalize_histogram(img)
        if self.blur_radius and self.blur_radius > 0:
            img = cu.apply_gaussian_blur(img, radius=self.blur_radius)
        return np.clip(img, 0.0, 1.0)

    def _filter_pixels(self, rgb: np.ndarray, mask: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        h, w = mask.shape
        flat = rgb.reshape(-1, 3)
        mask_flat = mask.reshape(-1)
        hsv = cu.rgb_to_hsv(flat)
        s = hsv[:, 1]
        v = hsv[:, 2]
        valid = mask_flat.copy()
        valid &= s >= self.s_min
        valid &= (v >= self.v_min) & (v <= self.v_max)
        # Specular highlights filter: high V, low S
        valid &= ~((v > 0.85) & (s < 0.15))
        # Chroma filter: drop near‑achromatic
        chroma = _compute_chroma(flat)
        valid &= chroma > 0.02
        idx = np.where(valid)[0]
        return idx, flat

    def _choose_k(self, X_lab: np.ndarray) -> int:
        if X_lab.shape[0] < 2:
            return 1
        best_score = -np.inf
        best_k = 1
        n = X_lab.shape[0]
        for k in range(max(1, self.min_k), max(1, self.max_k) + 1):
            centers, labels, inertia = _kmeans(X_lab, k, n_init=20, max_iter=300)
            # Balance penalty: discourage very small clusters
            weights = np.array([np.mean(labels == i) for i in range(k)], dtype=np.float32)
            min_w = weights.min() if weights.size else 0.0
            balance_pen = 1.0 - np.clip(0.05 - min_w, 0.0, 0.05) / 0.05
            score = -inertia / n * balance_pen
            if score > best_score:
                best_score = score
                best_k = k
        return best_k

    def _rank_clusters(self, centers_rgb: np.ndarray, labels: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        k = centers_rgb.shape[0]
        weights = np.array([np.mean(labels == i) for i in range(k)], dtype=np.float32)
        hsv_c = cu.rgb_to_hsv(centers_rgb)
        chroma = _compute_chroma(centers_rgb)
        chroma_norm = chroma / (np.max(chroma) + 1e-8)
        lightness_pen = np.where((hsv_c[:, 2] < 0.15) | (hsv_c[:, 2] > 0.95), 0.6, 1.0)
        achro_pen = np.where(chroma_norm < 0.1, 0.5, 1.0)
        scores = weights * (1.0 + chroma) * lightness_pen * achro_pen
        order = np.argsort(scores)[::-1]
        return order, scores

    def _name_colour(self, rgb: np.ndarray) -> Tuple[str, str, float, Optional[str]]:
        """Name a color and return its family.
        
        Parameters
        ----------
        rgb : np.ndarray
            RGB color in [0, 1] range
            
        Returns
        -------
        tuple
            (descriptive_name, family, css3_distance, css3_name_or_none)
        """
        # Generate descriptive name (always)
        descriptive_name = _generate_descriptive_name(rgb)
        
        # Get family from hue
        hue = float(cu.rgb_to_hsv(rgb[None, :]).squeeze(0)[0])
        family = _family_from_hue(hue)
        
        # Optionally find CSS3 match
        css3_name = None
        css3_distance = 0.0
        if self.use_css3_names:
            lab = cu.rgb_to_lab(rgb[None, :]).squeeze(0)
            names = list(_CSS3_LAB.keys())
            labs = np.stack([_CSS3_LAB[n] for n in names], axis=0)
            dE = cu.delta_e_ciede2000(np.repeat(lab[None, :], labs.shape[0], axis=0), labs)
            i = int(np.argmin(dE))
            css3_name = names[i]
            css3_distance = float(dE[i])
        
        return descriptive_name, family, css3_distance, css3_name

    def _decide_achromatic(self, hsv_pixels: np.ndarray) -> Tuple[str, Tuple[float, float, float]]:
        s = hsv_pixels[:, 1]
        v = hsv_pixels[:, 2]
        low_sat = s < self.achro_s_th
        if not low_sat.any():
            # Default to gray if nothing
            return "gray", (0.5, 0.5, 0.5)
        v_low = v[low_sat]
        frac_white_strong = float(np.mean(v_low >= self.white_v_strong_th))
        frac_white = float(np.mean(v_low >= self.white_v_th))
        frac_black = float(np.mean(v_low <= self.black_v_th))
        # Decide white vs black vs gray by dominant fraction with margin
        if frac_white - frac_black > self.achro_margin:
            return "white", (0.92, 0.92, 0.92)
        if frac_black - frac_white > self.achro_margin:
            return "black", (0.08, 0.08, 0.08)
        return "gray", (0.5, 0.5, 0.5)

    def enrich(self, crop_image: np.ndarray, conf: float = 0.5) -> Optional[Dict[str, Any]]:
        """Extract color attribute from a crop image.
        
        Parameters
        ----------
        crop_image : np.ndarray
            RGB image as numpy array (H, W, 3) with values in [0, 1]
        conf : float
            Detection confidence score
            
        Returns
        -------
        dict or None
            Color attribute dictionary with name, family, rgb, hex
        """
        if crop_image is None or crop_image.size == 0:
            return None
            
        rgb = crop_image
        h, w = rgb.shape[:2]

        # Create elliptical mask (no external mask support for now)
        mask = cu.create_elliptical_mask(size=(h, w))
        if self.mask_erode_px and self.mask_erode_px > 0:
            mask = cu.erode_mask(mask, ksize=3, iterations=max(1, int(self.mask_erode_px // 2)))

        # Preprocess image
        rgb_p = self._preprocess(rgb)

        # Pixel filtering
        idx, flat_rgb = self._filter_pixels(rgb_p, mask)
        if idx.size == 0:
            # Fallback: achromatic based on overall
            hsv = cu.rgb_to_hsv(rgb_p.reshape(-1, 3))
            css3_achro_name, ach_rgb = self._decide_achromatic(hsv)
            ach_rgb_array = np.array(ach_rgb, dtype=np.float32)
            descriptive_achro_name = _generate_descriptive_name(ach_rgb_array)
            value = {
                "name": descriptive_achro_name,
                "family": css3_achro_name if css3_achro_name in ("white", "black", "gray") else "gray",
                "rgb": list(ach_rgb),
                "hex": _rgb_to_hex(ach_rgb_array),
            }
            if self.use_css3_names:
                value["css3_name"] = css3_achro_name
            return value

        # Sample pixels for speed
        rng = np.random.RandomState(0)
        if idx.size > self.sample_pixels:
            idx = rng.choice(idx, size=self.sample_pixels, replace=False)
        X_rgb = flat_rgb[idx]
        X_lab = cu.rgb_to_lab(X_rgb)
        hsv_all = cu.rgb_to_hsv(flat_rgb)
        s_all = hsv_all[:, 1]
        # Check achromatic fraction on the crop area
        low_sat_frac = float(np.mean(s_all < self.achro_s_th))
        if low_sat_frac >= self.achro_frac_th or np.median(s_all) < self.achro_s_th:
            css3_achro_name, ach_rgb = self._decide_achromatic(hsv_all)
            ach_rgb_array = np.array(ach_rgb, dtype=np.float32)
            descriptive_achro_name = _generate_descriptive_name(ach_rgb_array)
            value = {
                "name": descriptive_achro_name,
                "family": css3_achro_name if css3_achro_name in ("white", "black", "gray") else "gray",
                "rgb": list(ach_rgb),
                "hex": _rgb_to_hex(ach_rgb_array),
            }
            if self.use_css3_names:
                value["css3_name"] = css3_achro_name
            return value

        # Choose K and cluster
        k = self._choose_k(X_lab)
        centers_lab, labels, _ = _kmeans(X_lab, k, n_init=20, max_iter=300)
        centers_rgb = cu.lab_to_rgb(centers_lab)

        # Rank clusters and select best
        order, scores = self._rank_clusters(centers_rgb, labels)
        best = int(order[0]) if order.size else 0
        best_rgb = centers_rgb[best]
        # Name colour
        descriptive_name, family, css3_distance, css3_name = self._name_colour(best_rgb)

        # Build value dict with real RGB and hex
        value: Dict[str, Any] = {
            "name": descriptive_name,
            "family": family,
            "rgb": [float(x) for x in best_rgb.tolist()],
            "hex": _rgb_to_hex(best_rgb),
        }
        
        # Optionally include CSS3 match
        if self.use_css3_names and css3_name:
            value["css3_name"] = css3_name
            value["css3_distance"] = float(css3_distance)

        return value

