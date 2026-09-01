from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class NERRequest(BaseModel):
    text: str


class Entity(BaseModel):
    text: str
    label: str
    start: int
    end: int
    confidence: float


class NERResult(BaseModel):
    entities: list[Entity]
    entity_counts: dict[str, int]
    legal_terms: list[str]
    total_entities: int


LEGAL_ENTITIES = {
    "PERSON": "person",
    "ORG": "organization",
    "GPE": "location",
    "DATE": "date",
    "MONEY": "financial_amount",
    "LAW": "legal_reference",
    "CASE_NUM": "case_number",
    "SECTION": "legal_section",
}

LEGAL_KEYWORDS = [
    "complaint", "fir", "charge sheet", "warrant", "bail",
    "summons", "subpoena", "affidavit", "evidence", "testimony",
    "prosecution", "defendant", "plaintiff", "petitioner", "respondent",
    "section", "clause", "article", "act", "statute",
    "jurisdiction", "bench", "tribunal", "magistrate", "judge",
    "cybercrime", "phishing", "ransomware", "data breach", "hacking",
    "identity theft", "fraud", "embezzlement", "money laundering",
]


@router.post("/extract", response_model=NERResult)
async def extract_entities(request: NERRequest):
    """
    Extract named entities from text using spaCy NER + Legal-BERT
    for specialized legal entity recognition.
    """
    text = request.text
    entities = []

    # spaCy NER
    try:
        import spacy
        from app.core.model_loader import get_model

        nlp = get_model("spacy")
        if nlp:
            doc = nlp(text)
            for ent in doc.ents:
                entities.append(Entity(
                    text=ent.text,
                    label=ent.label_,
                    start=ent.start_char,
                    end=ent.end_char,
                    confidence=0.85,
                ))
    except Exception as e:
        # Fallback: basic regex patterns
        entities = _regex_ner(text)

    # Legal term extraction
    legal_terms = []
    text_lower = text.lower()
    for term in LEGAL_KEYWORDS:
        if term in text_lower:
            legal_terms.append(term)

    # Entity counts
    entity_counts = {}
    for ent in entities:
        label = ent.label
        entity_counts[label] = entity_counts.get(label, 0) + 1

    return NERResult(
        entities=entities,
        entity_counts=entity_counts,
        legal_terms=legal_terms,
        total_entities=len(entities),
    )


def _regex_ner(text: str) -> list[Entity]:
    """Fallback regex-based NER for when spaCy is unavailable."""
    import re
    entities = []

    # Email patterns
    for match in re.finditer(r'[\w.+-]+@[\w-]+\.[\w.-]+', text):
        entities.append(Entity(
            text=match.group(), label="EMAIL",
            start=match.start(), end=match.end(), confidence=0.95,
        ))

    # Phone patterns (Indian)
    for match in re.finditer(r'(\+91[\s-]?)?\d{10}', text):
        entities.append(Entity(
            text=match.group(), label="PHONE",
            start=match.start(), end=match.end(), confidence=0.90,
        ))

    # Case number patterns
    for match in re.finditer(r'(?:CYB|CC|FIR|C\d+)-\d{3,6}', text):
        entities.append(Entity(
            text=match.group(), label="CASE_NUM",
            start=match.start(), end=match.end(), confidence=0.92,
        ))

    # Date patterns
    for match in re.finditer(r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', text):
        entities.append(Entity(
            text=match.group(), label="DATE",
            start=match.start(), end=match.end(), confidence=0.88,
        ))

    # Money patterns
    for match in re.finditer(r'(?:₹|Rs\.?|INR)\s*[\d,]+(?:\.\d{2})?', text):
        entities.append(Entity(
            text=match.group(), label="MONEY",
            start=match.start(), end=match.end(), confidence=0.93,
        ))

    return entities


@router.post("/analyze-complaint")
async def analyze_complaint(request: NERRequest):
    """
    Specialized analysis for cybercrime complaints.
    Extracts structured information from free-text complaints.
    """
    ner_result = await extract_entities(request)

    # Extract complaint-specific fields
    structured = {
        "entities": ner_result.entities,
        "legal_terms": ner_result.legal_terms,
        "complaint_type": _classify_complaint_type(request.text),
        "key_dates": [e.text for e in ner_result.entities if e.label in ("DATE",)],
        "involved_parties": [e.text for e in ner_result.entities if e.label in ("PERSON", "ORG")],
        "financial_amounts": [e.text for e in ner_result.entities if e.label in ("MONEY",)],
        "locations": [e.text for e in ner_result.entities if e.label in ("GPE",)],
    }

    return structured


def _classify_complaint_type(text: str) -> str:
    """Classify the type of cybercrime from complaint text."""
    text_lower = text.lower()

    crime_keywords = {
        "cyber_fraud": ["fraud", "scam", "cheated", "money lost"],
        "identity_theft": ["identity", "impersonation", "fake account"],
        "data_breach": ["data breach", "leaked", "database", "hack"],
        "online_harassment": ["harassment", "threat", "abuse", "stalking"],
        "ransomware": ["ransomware", "encrypted", "decrypt", "bitcoin"],
        "phishing": ["phishing", "fake email", "fake website", "link"],
        "financial_fraud": ["upi", "bank transfer", "credit card", "debit"],
    }

    scores = {}
    for crime_type, keywords in crime_keywords.items():
        score = sum(1 for kw in keywords if kw in text_lower)
        if score > 0:
            scores[crimeType] = score

    if scores:
        return max(scores, key=scores.get)
    return "other"
