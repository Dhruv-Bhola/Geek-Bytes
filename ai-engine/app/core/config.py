import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8000"))
    debug: bool = os.getenv("DEBUG", "false").lower() == "true"

    dms_api_url: str = os.getenv("DMS_API_URL", "http://localhost:5000")
    dms_api_key: str = os.getenv("DMS_API_KEY", "")

    trocr_model_path: str = os.getenv("TROCR_MODEL_PATH", "./models/trocr-base-printed")
    legal_bert_model_path: str = os.getenv("LEGAL_BERT_MODEL_PATH", "./models/legal-bert-base")
    summarizer_model_path: str = os.getenv("SUMMARIZER_MODEL_PATH", "./models/bart-large-cnn")

    tesseract_cmd: str = os.getenv("TESSERACT_CMD", "/usr/bin/tesseract")

    blockchain_rpc_url: str = os.getenv("BLOCKCHAIN_RPC_URL", "http://127.0.0.1:8545")

    temp_upload_dir: str = os.getenv("TEMP_UPLOAD_DIR", "/tmp/dms_uploads")
    max_file_size_mb: int = int(os.getenv("MAX_FILE_SIZE_MB", "100"))

    class Config:
        env_file = ".env"


settings = Settings()

# Ensure temp directory exists
Path(settings.temp_upload_dir).mkdir(parents=True, exist_ok=True)
