# Model loaders - initialized at startup
_models = {}


def load_models():
    """Load all AI models into memory at startup."""
    global _models

    # OCR model (TrOCR)
    try:
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel
        _models["trocr_processor"] = TrOCRProcessor.from_pretrained("microsoft/trocr-base-printed")
        _models["trocr_model"] = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-base-printed")
        print("TrOCR model loaded")
    except Exception as e:
        print(f"Warning: Could not load TrOCR model: {e}")

    # Tesseract (fallback OCR)
    try:
        import pytesseract
        pytesseract.pytesseract.tesseract_cmd = "/usr/bin/tesseract"
        _models["tesseract"] = pytesseract
        print("Tesseract OCR available")
    except Exception as e:
        print(f"Warning: Tesseract not available: {e}")

    # spaCy NER model
    try:
        import spacy
        _models["spacy"] = spacy.load("en_core_web_sm")
        print("spaCy NER model loaded")
    except Exception as e:
        print(f"Warning: Could not load spaCy model: {e}")

    # Sentence transformer for embeddings
    try:
        from sentence_transformers import SentenceTransformer
        _models["sentence_transformer"] = SentenceTransformer("all-MiniLM-L6-v2")
        print("Sentence transformer loaded")
    except Exception as e:
        print(f"Warning: Could not load sentence transformer: {e}")

    # Summarization model
    try:
        from transformers import pipeline
        _models["summarizer"] = pipeline(
            "summarization", model="facebook/bart-large-cnn"
        )
        print("Summarization model loaded")
    except Exception as e:
        print(f"Warning: Could not load summarizer: {e}")


def get_model(name: str):
    """Retrieve a loaded model by name."""
    return _models.get(name)
