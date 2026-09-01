"""
Secure Evidence DMS AI Engine - FastAPI entrypoint.

Serves both the forward-compatible flat routers (legacy /api/v1) and the
primary `/api/ai/*` endpoints used by the frontend:

    POST /api/ai/classify      NLP: legal/complaint classification
    POST /api/ai/ocr-extract   NLP: OCR + NER pipeline
    POST /api/ai/summarize     NLP: RAG case brief generator
    POST /api/ai/deepfake-scan Forensics: synthetic/manipulation detection
    POST /api/ai/correlate     Forensics: cross-case entity linking graph
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api.routers import nlp, forensics

# Legacy flat routers are retained for backward compatibility.
from app.api import classify, ocr, deepfake, ner, rag, verify


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Loading AI models...")

    # Load models in a background thread so startup and /health never block.
    # Heavy ML weights (TrOCR/BART/sentence-transformers) can take minutes or
    # exceed this machine's memory; every endpoint has heuristic fallbacks and
    # models become available when (and if) their load completes.
    import threading

    def _load():
        try:
            from app.core.model_loader import load_models

            load_models()
            print("All AI models loaded successfully")
        except Exception as exc:  # pragma: no cover - non-fatal
            print(f"Model loading degraded (using heuristics): {exc}")

    threading.Thread(target=_load, daemon=True).start()
    yield
    print("Shutting down AI engine...")


app = FastAPI(
    title="Legal Investigation AI Engine",
    description="AI & Forensics Microservice for Document Analysis, OCR, NER, Deepfake Detection, and RAG",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Primary AI API (frontend-bound) ---------------------------------
app.include_router(nlp.router, prefix="/api/ai", tags=["AI - NLP"])
app.include_router(forensics.router, prefix="/api/ai", tags=["AI - Forensics"])

# ---- Legacy flat routers (backward compatible) -----------------------
app.include_router(classify.router, prefix="/api/v1/classify", tags=["Classification"])
app.include_router(ocr.router, prefix="/api/v1/ocr", tags=["OCR"])
app.include_router(deepfake.router, prefix="/api/v1/deepfake", tags=["Deepfake Detection"])
app.include_router(ner.router, prefix="/api/v1/ner", tags=["Named Entity Recognition"])
app.include_router(rag.router, prefix="/api/v1/rag", tags=["RAG Summarization"])
app.include_router(verify.router, prefix="/api/v1/verify", tags=["Blockchain Verification"])


@app.get("/")
async def root():
    return {
        "service": "dms-ai-engine",
        "version": "2.0.0",
        "endpoints": {
            "classify": "/api/ai/classify",
            "ocr-extract": "/api/ai/ocr-extract",
            "deepfake-scan": "/api/ai/deepfake-scan",
            "correlate": "/api/ai/correlate",
            "summarize": "/api/ai/summarize",
        },
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "dms-ai-engine"}
