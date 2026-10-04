"""Fast, non-clinical technical quality checks for uploaded screening images."""

from __future__ import annotations

from io import BytesIO
from typing import Any

import numpy as np
from PIL import Image, UnidentifiedImageError


MAX_IMAGE_BYTES = 50 * 1024 * 1024
MIN_IMAGE_DIMENSION = 128
BLUR_VARIANCE_THRESHOLD = 20.0

REQUIRED_VIEW_GROUPS = {
    "breast": {
        "MLO": ("MLO",),
        "CC": ("CC",),
    }
}


def _inspect_one(filename: str, content: bytes) -> dict[str, Any]:
    reasons: list[str] = []
    if not content:
        return {"filename": filename, "quality": "poor", "reasons": ["The image file is empty."]}
    if len(content) > MAX_IMAGE_BYTES:
        return {"filename": filename, "quality": "poor", "reasons": ["The image exceeds the 50 MB upload limit."]}

    try:
        with Image.open(BytesIO(content)) as source:
            image = source.convert("L")
    except (UnidentifiedImageError, OSError, ValueError):
        return {
            "filename": filename,
            "quality": "poor",
            "reasons": ["The file could not be read as a supported raster image. Retake or export it as JPEG, PNG, or BMP."],
        }

    width, height = image.size
    if width < MIN_IMAGE_DIMENSION or height < MIN_IMAGE_DIMENSION:
        reasons.append(f"Image resolution is too small ({width}×{height}); upload an image at least 128×128 pixels.")

    # Normalize the analysis size so the blur heuristic is less dependent on
    # the source image dimensions. The check is intentionally conservative.
    image.thumbnail((512, 512), Image.Resampling.LANCZOS)
    gray = np.asarray(image, dtype=np.float32)
    if gray.size == 0:
        reasons.append("The image has no readable pixel data.")
    else:
        dark_fraction = float(np.mean(gray <= 3))
        bright_fraction = float(np.mean(gray >= 252))
        p05, p95 = np.percentile(gray, [5, 95])

        if dark_fraction >= 0.98:
            reasons.append("The image is almost entirely black (severely under-exposed or blank).")
        elif bright_fraction >= 0.98:
            reasons.append("The image is almost entirely white (severely over-exposed or blank).")
        elif float(p95 - p05) < 12.0:
            reasons.append("The image has very little contrast; exposure or image capture may be inadequate.")

        if gray.shape[0] >= 3 and gray.shape[1] >= 3:
            center = gray[1:-1, 1:-1]
            laplacian = (
                gray[:-2, 1:-1]
                + gray[2:, 1:-1]
                + gray[1:-1, :-2]
                + gray[1:-1, 2:]
                - 4.0 * center
            )
            blur_variance = float(np.var(laplacian))
            if blur_variance < BLUR_VARIANCE_THRESHOLD:
                reasons.append("The image appears out of focus or blurred (low edge sharpness). Retake the image in focus.")

    return {
        "filename": filename,
        "quality": "poor" if reasons else "adequate",
        "reasons": reasons,
        "width": width,
        "height": height,
    }


def assess_image_set(
    module: str,
    images: list[tuple[str, bytes]],
    image_views: list[str] | None = None,
) -> dict[str, Any]:
    """Return a structured quality decision for one upload set."""
    results = [_inspect_one(name or "uploaded image", data) for name, data in images]
    reasons = [f"{item['filename']}: {reason}" for item in results for reason in item["reasons"]]

    missing_views: list[str] = []
    required = REQUIRED_VIEW_GROUPS.get((module or "").lower().strip(), {})
    if required:
        if len(images) < 2:
            reasons.append("Breast screening requires separate MLO and CC images before analysis.")
        labeled = {str(view or "").strip().upper() for view in (image_views or [])}
        missing_views = [
            label for label, aliases in required.items()
            if not any(any(alias in view for alias in aliases) for view in labeled)
        ]
        if missing_views:
            reasons.append(
                "Required mammogram view missing: " + ", ".join(missing_views) + ". Label uploaded images and add the missing view."
            )

    if not images:
        reasons.append("Upload at least one image before analysis.")

    return {
        "quality": "poor" if reasons else "adequate",
        "reasons": reasons,
        "images": results,
        "missing_required_views": missing_views,
        "recommendation": "Retake recommended" if reasons else "Image quality adequate for technical checks",
        "method": "Prototype technical checks (resolution, exposure/contrast, and edge sharpness); not clinically validated.",
    }
