from fastapi import APIRouter
from pydantic import BaseModel
import httpx

router = APIRouter()


class VerificationRequest(BaseModel):
    evidence_id: str
    sha256_hash: str


class VerificationResult(BaseModel):
    evidence_id: str
    is_verified: bool
    on_chain_hash: str | None
    submitted_hash: str
    block_number: int | None
    tx_hash: str | None
    verified_at: str | None
    discrepancy: str | None


@router.post("/evidence", response_model=VerificationResult)
async def verify_evidence_onchain(request: VerificationRequest):
    """
    Verify evidence integrity by comparing local SHA-256 hash
    against the on-chain record via the Secure Evidence DMS server.
    """
    import os
    from datetime import datetime

    api_url = os.getenv("DMS_API_URL", "http://localhost:5000")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{api_url}/api/v1/evidence/{request.evidence_id}/verify",
                headers={"Content-Type": "application/json"},
            )

            if response.status_code == 200:
                data = response.json()
                on_chain = data.get("onChainVerification", {})

                if on_chain and "error" not in on_chain:
                    on_chain_hash = on_chain.get("sha256Hash", "0x0")
                    # Strip 0x prefix if present
                    clean_hash = on_chain_hash[2:] if on_chain_hash.startswith("0x") else on_chain_hash

                    is_verified = clean_hash.lower() == request.sha256_hash.lower()

                    return VerificationResult(
                        evidence_id=request.evidence_id,
                        is_verified=is_verified,
                        on_chain_hash=on_chain_hash,
                        submitted_hash=request.sha256_hash,
                        block_number=on_chain.get("blockNumber"),
                        tx_hash=data.get("evidence", {}).get("txHash"),
                        verified_at=datetime.utcnow().isoformat(),
                        discrepancy=None if is_verified else "Hash mismatch - potential tampering detected",
                    )
    except Exception:
        pass

    return VerificationResult(
        evidence_id=request.evidence_id,
        is_verified=False,
        on_chain_hash=None,
        submitted_hash=request.sha256_hash,
        block_number=None,
        tx_hash=None,
        verified_at=None,
        discrepancy="Could not reach blockchain verification service",
    )


@router.get("/health")
async def verify_health():
    """Check if blockchain verification service is accessible."""
    import os

    api_url = os.getenv("DMS_API_URL", "http://localhost:5000")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{api_url}/health", timeout=5.0)
            return {
                "server_reachable": response.status_code == 200,
                "api_url": api_url,
            }
    except Exception as e:
        return {
            "server_reachable": False,
            "api_url": api_url,
            "error": str(e),
        }
