from fastapi import APIRouter, UploadFile, File
from pydantic import BaseModel

router = APIRouter()


class OCRResult(BaseModel):
    text: str
    confidence: float
    language: str
    word_count: int
    engine_used: str


@router.post("/extract", response_model=OCRResult)
async def extract_text(
    file: UploadFile = File(...),
    engine: str = "tesseract",
):
    """
    Extract text from an image using OCR.
    Supports TrOCR (transformer-based) and Tesseract engines.
    """
    contents = await file.read()

    if engine == "trocr":
        return await _trocr_extract(contents, file.content_type)
    else:
        return await _tesseract_extract(contents)


async def _tesseract_extract(image_bytes: bytes) -> OCRResult:
    """Fallback OCR using Tesseract."""
    try:
        import pytesseract
        from PIL import Image
        import io

        image = Image.open(io.BytesIO(image_bytes))
        text = pytesseract.image_to_string(image)
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)

        # Calculate average confidence
        confidences = [int(c) for c in data["conf"] if int(c) > 0]
        avg_confidence = sum(confidences) / len(confidences) / 100 if confidences else 0

        return OCRResult(
            text=text.strip(),
            confidence=round(avg_confidence, 3),
            language="eng",
            word_count=len(text.split()),
            engine_used="tesseract",
        )
    except Exception as e:
        return OCRResult(
            text=f"OCR failed: {str(e)}",
            confidence=0.0,
            language="unknown",
            word_count=0,
            engine_used="tesseract-error",
        )


async def _trocr_extract(image_bytes: bytes, mime_type: str) -> OCRResult:
    """Transformer-based OCR using TrOCR."""
    try:
        import torch
        from PIL import Image
        import io
        from app.core.model_loader import get_model

        processor = get_model("trocr_processor")
        model = get_model("trocr_model")

        if not processor or not model:
            return await _tesseract_extract(image_bytes)

        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        pixel_values = processor(images=image, return_tensors="pt").pixel_values

        with torch.no_grad():
            generated_ids = model.generate(pixel_values)
            text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]

        return OCRResult(
            text=text.strip(),
            confidence=0.95,
            language="eng",
            word_count=len(text.split()),
            engine_used="trocr",
        )
    except Exception as e:
        return await _tesseract_extract(image_bytes)


@router.post("/batch")
async def ocr_batch(files: list[UploadFile] = File(...)):
    """Batch OCR extraction."""
    results = []
    for file in files:
        result = await extract_text(file)
        results.append({"filename": file.filename, **result.model_dump()})
    return {"results": results, "total": len(results)}
