import asyncio

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class RAGRequest(BaseModel):
    text: str
    query: str = ""
    max_length: int = 500


class RAGResult(BaseModel):
    summary: str
    key_points: list[str]
    document_type: str
    confidence: float
    word_count_original: int
    word_count_summary: int


@router.post("/summarize", response_model=RAGResult)
async def summarize_document(request: RAGRequest):
    """
    Generate a structured summary of legal/forensic documents
    using RAG (Retrieval-Augmented Generation) with BART/T5.
    """
    text = request.text
    original_words = len(text.split())

    # Try transformer-based summarization
    try:
        from app.core.model_loader import get_model
        summarizer = get_model("summarizer")

        if summarizer and len(text) > 100:
            # Truncate to model's max length
            max_input = 1024
            truncated = text[:max_input * 4]  # ~4 chars per token

            # BART inference is CPU-bound and can block the event loop; run it in
            # a worker thread with a hard timeout and fall back to the fast
            # extractive summarizer so /health and other endpoints never wedge.
            result = await asyncio.wait_for(
                asyncio.to_thread(
                    lambda: summarizer(
                        truncated,
                        max_length=min(request.max_length, 200),
                        min_length=50,
                        do_sample=False,
                    )
                ),
                timeout=10,
            )
            summary = result[0]["summary_text"]
        else:
            summary = _extractive_summary(text, request.max_length)
    except Exception:
        summary = _extractive_summary(text, request.max_length)

    # Extract key points
    key_points = _extract_key_points(text)

    # Detect document type
    doc_type = _detect_document_type(text)

    summary_words = len(summary.split())

    return RAGResult(
        summary=summary,
        key_points=key_points,
        document_type=doc_type,
        confidence=0.85,
        word_count_original=original_words,
        word_count_summary=summary_words,
    )


def _extractive_summary(text: str, max_length: int = 500) -> str:
    """Fallback extractive summarization by selecting important sentences."""
    sentences = text.replace('\n', ' ').split('. ')
    if not sentences:
        return text[:max_length]

    # Score sentences by length and keyword presence
    important_keywords = [
        "evidence", "complaint", "incident", "suspect", "victim",
        "fraud", "breach", "attack", "malware", "phishing",
        "financial", "transaction", "amount", "loss", "damage",
    ]

    scored = []
    for sent in sentences:
        score = 0
        lower = sent.lower()
        for kw in important_keywords:
            if kw in lower:
                score += 2
        score += min(len(sent.split()), 20) / 20
        scored.append((score, sent.strip()))

    scored.sort(reverse=True)

    summary = ""
    for _, sent in scored:
        if len(summary) + len(sent) > max_length:
            break
        summary += sent + ". "

    return summary.strip() or text[:max_length]


def _extract_key_points(text: str) -> list[str]:
    """Extract key bullet points from text."""
    points = []
    text_lower = text.lower()

    key_phrases = {
        "Incident": ["incident occurred", "incident reported", "took place"],
        "Financial Impact": ["lost", "amount", "transferred", "stolen", "defrauded"],
        "Evidence Available": ["evidence", "screenshot", "recording", "document"],
        "Suspect Information": ["suspect", "accused", "perpetrator", "attacker"],
        "Timeline": ["date", "time", "when", "on the date"],
        "Legal Action Required": ["complaint", "fir", "action", "investigation"],
    }

    for label, phrases in key_phrases.items():
        for phrase in phrases:
            if phrase in text_lower:
                # Extract the sentence containing this phrase
                for sentence in text.split('.'):
                    if phrase in sentence.lower():
                        points.append(f"{label}: {sentence.strip()[:200]}")
                        break
                break

    return points[:8]


def _detect_document_type(text: str) -> str:
    """Detect the type of legal/forensic document."""
    text_lower = text.lower()

    type_signals = {
        "complaint": ["complaint", "grievance", "report"],
        "fir": ["first information report", "fir"],
        "charge_sheet": ["charge sheet", "chargesheet", "charges filed"],
        "evidence_log": ["evidence log", "chain of custody", "exhibit"],
        "report": ["report", "analysis", "findings", "summary"],
        "affidavit": ["affidavit", "sworn statement", "deposition"],
        "court_order": ["court order", "judgment", "ruling", "order"],
    }

    for doc_type, signals in type_signals.items():
        if any(s in text_lower for s in signals):
            return doc_type

    return "general_document"
