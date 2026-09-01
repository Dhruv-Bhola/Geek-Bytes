# Secure Evidence DMS

**Secure Digital Document Management System for Legal and Investigation Documents**

> Problem Statement ID: SIH26190

## Architecture

```
dms/
├── client/          # Frontend - 13-page static prototype (HTML/CSS/JS)
├── server/          # Backend API Gateway (Node.js/Express + Prisma + PostgreSQL)
├── ai-engine/       # AI & Forensics Microservice (Python/FastAPI)
├── contracts/       # Smart Contracts (Hardhat/Solidity)
├── database/        # PostgreSQL schemas, migrations, and seeds
├── docker-compose.yml
└── README.md
```

## Features

### Evidence Management
- **Drag-and-drop evidence upload** with client-side validation
- **AES-256-GCM encryption** for all evidence files at rest
- **SHA-256 integrity hashing** with blockchain anchoring
- **S3-compatible object storage** with server-side encryption

### Blockchain Audit Trail
- **Immutable audit logging** via Solidity smart contracts
- **Chain-of-custody tracking** with on-chain transfer records
- **Real-time evidence verification** against blockchain records

### AI & Forensics
- **OCR** (TrOCR/Tesseract) for document text extraction
- **Legal NER** (spaCy/Legal-BERT) for entity extraction from legal documents
- **Deepfake/manipulation detection** using ELA, noise analysis, and edge consistency
- **RAG summarization** (BART/T5) for document summarization

### Security
- **JWT-based authentication** with refresh tokens
- **Role-Based Access Control** (victim, police, forensic, legal, admin)
- **Rate limiting** and security headers (Helmet.js)
- **Input validation** via express-validator
- **Comprehensive audit logging** for all operations

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- Python 3.11+ (for AI engine development)

### Docker (Recommended)
```bash
# Clone the repository
git clone <repository-url>
cd cyberissues

# Start all services
docker-compose up -d

# Run database migrations and seeds
docker-compose exec server npx prisma migrate dev
docker-compose exec server node prisma/seed.js

# Access the application
# Frontend: http://localhost:3000
# API:      http://localhost:5000/api/v1
# AI:       http://localhost:8000/docs
# RPC:      http://localhost:8545
```

### Local Development
```bash
# Server
cd server
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev
npm run dev

# AI Engine
cd ai-engine
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Contracts
cd contracts
npm install
npx hardhat node
npx hardhat run scripts/deploy.js --network localhost

# Frontend
cd client
# Open index.html in browser or use: npx serve .
```

## API Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/v1/auth/register` | Register user | No |
| POST | `/api/v1/auth/login` | Login | No |
| POST | `/api/v1/auth/refresh` | Refresh token | No |
| GET | `/api/v1/auth/profile` | Get profile | Yes |
| POST | `/api/v1/cases/complaints` | File complaint | Yes |
| GET | `/api/v1/cases/complaints` | List complaints | Yes |
| POST | `/api/v1/cases` | Create case | Yes |
| GET | `/api/v1/cases` | List cases | Yes |
| GET | `/api/v1/cases/:id` | Get case detail | Yes |
| PATCH | `/api/v1/cases/:id` | Update case | Yes |
| POST | `/api/v1/evidence/upload` | Upload evidence | Yes |
| GET | `/api/v1/evidence/case/:caseId` | Get case evidence | Yes |
| GET | `/api/v1/evidence/:id/verify` | Verify evidence | Yes |
| GET | `/api/v1/evidence/:id/download` | Download evidence | Yes |
| GET | `/api/v1/custody/case/:caseId` | Get custody log | Yes |
| POST | `/api/v1/custody` | Add custody entry | Yes |
| POST | `/api/v1/reports` | Generate report | Yes |
| GET | `/api/v1/reports/case/:caseId` | Get reports | Yes |
| PATCH | `/api/v1/reports/:id/sign` | Sign report | Yes |

## AI Engine Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/classify/document` | Classify document type |
| POST | `/api/v1/ocr/extract` | OCR text extraction |
| POST | `/api/v1/deepfake/detect` | Deepfake/manipulation detection |
| POST | `/api/v1/ner/extract` | Named entity recognition |
| POST | `/api/v1/rag/summarize` | Document summarization |
| POST | `/api/v1/verify/evidence` | Blockchain evidence verification |

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express.js, Prisma ORM |
| Database | PostgreSQL 16 |
| AI/ML | Python, FastAPI, TrOCR, spaCy, BART |
| Blockchain | Solidity, Hardhat, Ethereum |
| Storage | AWS S3 (encrypted) |
| Auth | JWT (Access + Refresh tokens) |
| Container | Docker, Docker Compose |

## License

Government of India - Cybercrime Investigation
