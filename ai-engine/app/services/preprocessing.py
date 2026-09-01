from fastapi import UploadFile, File
from PIL import Image
import io


async def preprocess_image(image_bytes: bytes, mime_type: str) -> Image.Image:
    """Standardize image for OCR and analysis."""
    image = Image.open(io.BytesIO(image_bytes))

    # Convert to RGB if needed
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    # Resize if too large (max 2048px on longest side)
    max_size = 2048
    if max(image.size) > max_size:
        ratio = max_size / max(image.size)
        new_size = tuple(int(s * ratio) for s in image.size)
        image = image.resize(new_size, Image.LANCZOS)

    return image


def extract_metadata(file: UploadFile) -> dict:
    """Extract basic file metadata for analysis."""
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size": file.size,
    }
