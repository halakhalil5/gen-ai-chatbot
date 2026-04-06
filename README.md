# Gen AI Chatbot + RAG (FAISS)

This project now has two services:

- Node.js app at port 3000 for frontend + proxy routes
- FastAPI RAG service at port 8000 for retrieval and indexing

## Setup

1. Install Node dependencies:

	npm install

2. Create .env from .env.example:

	OPENROUTER_API_KEY=your_key_here
	OPENROUTER_MODEL=openrouter/auto
	PORT=3000
	RAG_SERVICE_URL=http://localhost:8000

3. Set up Python dependencies for RAG service:

	pip install -r rag_service/requirement.txt

4. Start FastAPI service:

	cd rag_service
	uvicorn main:app --reload --port 8000

5. Start Node app (from project root):

	npm run dev

6. Open http://localhost:3000

## Flow

- Upload documents from the frontend. Files are sent to Node route /api/upload-documents.
- Node forwards files to FastAPI /upload and triggers FAISS index rebuild.
- Chat requests are sent to Node route /chat.
- Node forwards to FastAPI /rag and returns the answer.
