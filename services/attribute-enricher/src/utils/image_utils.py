"""Image loading and manipulation utilities."""

import numpy as np
from PIL import Image, ImageDraw
from typing import Tuple, Optional


def load_image(path: str) -> np.ndarray:
    """Load an image from file and convert to RGB float array [0, 1].
    
    Parameters
    ----------
    path : str
        Path to the image file
        
    Returns
    -------
    np.ndarray
        RGB image as numpy array (H, W, 3) with values in [0, 1]
    """
    img = Image.open(path).convert("RGB")
    return np.asarray(img, dtype=np.float32) / 255.0


def save_image(arr: np.ndarray, path: str) -> None:
    """Save a float RGB array [0, 1] to file.
    
    Parameters
    ----------
    arr : np.ndarray
        RGB image as numpy array (H, W, 3) with values in [0, 1]
    path : str
        Output path
    """
    img = Image.fromarray(np.clip(arr * 255.0, 0, 255).astype("uint8"))
    img.save(path, quality=95)


def crop_bbox(image: np.ndarray, bbox: dict, image_width: int, image_height: int) -> np.ndarray:
    """Crop an image using a bounding box.
    
    Parameters
    ----------
    image : np.ndarray
        Full image as numpy array (H, W, 3)
    bbox : dict
        Bounding box with keys 'x', 'y', 'w', 'h' (normalized 0-1 coordinates)
        x, y: center of bbox
        w, h: width and height
    image_width : int
        Original image width in pixels
    image_height : int
        Original image height in pixels
        
    Returns
    -------
    np.ndarray
        Cropped image region
    """
    # Convert normalized bbox to pixel coordinates
    x_center = bbox['x'] * image_width
    y_center = bbox['y'] * image_height
    w = bbox['w'] * image_width
    h = bbox['h'] * image_height
    
    # Calculate top-left corner
    x1 = int(max(0, x_center - w / 2))
    y1 = int(max(0, y_center - h / 2))
    x2 = int(min(image_width, x_center + w / 2))
    y2 = int(min(image_height, y_center + h / 2))
    
    # Crop
    return image[y1:y2, x1:x2]


def draw_bbox_on_image(image_path: str, bbox: dict, output_path: str, 
                       color_info: Optional[dict] = None, 
                       line_width: int = 3) -> None:
    """Draw a bounding box on an image and save it.
    
    Parameters
    ----------
    image_path : str
        Path to input image
    bbox : dict
        Bounding box with keys 'x', 'y', 'w', 'h' (normalized 0-1 coordinates)
    output_path : str
        Path to save annotated image
    color_info : dict, optional
        Color information to display (with 'name' and 'hex' keys)
    line_width : int
        Width of the bounding box line
    """
    # Load image
    img = Image.open(image_path).convert("RGB")
    width, height = img.size
    
    # Convert normalized bbox to pixel coordinates
    x_center = bbox['x'] * width
    y_center = bbox['y'] * height
    w = bbox['w'] * width
    h = bbox['h'] * height
    
    x1 = int(x_center - w / 2)
    y1 = int(y_center - h / 2)
    x2 = int(x_center + w / 2)
    y2 = int(y_center + h / 2)
    
    # Draw bbox
    draw = ImageDraw.Draw(img)
    
    # Use color from detection if available
    bbox_color = "#00FF00"  # Default green
    if color_info and 'hex' in color_info:
        bbox_color = color_info['hex']
    
    # Draw rectangle
    for i in range(line_width):
        draw.rectangle(
            [x1 - i, y1 - i, x2 + i, y2 + i],
            outline=bbox_color,
            width=1
        )
    
    # Draw label if color info available
    if color_info and 'name' in color_info:
        label = color_info['name']
        # Draw text background
        text_bbox = draw.textbbox((x1, y1 - 20), label)
        draw.rectangle(text_bbox, fill=bbox_color)
        draw.text((x1, y1 - 20), label, fill="#000000")
    
    # Save
    img.save(output_path, quality=95)

