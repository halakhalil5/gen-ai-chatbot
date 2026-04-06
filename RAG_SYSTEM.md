# RAG System Overview

This project uses a Retrieval-Augmented Generation (RAG) setup with two services:

- Node.js (Express): frontend host + proxy API
- Python (FastAPI): document ingestion, FAISS retrieval, and answer generation

## High-Level Architecture

1. Frontend sends document uploads and chat questions to Node.
2. Node forwards RAG requests to FastAPI.
3. FastAPI:
   - Ingests and chunks uploaded text
   - Creates embeddings
   - Builds/updates FAISS index
   - Retrieves relevant chunks for each query
   - Calls an LLM with retrieved context
4. FastAPI returns the answer to Node.
5. Node returns the answer to the frontend.

## Services and Ports

- Node app: http://localhost:3000
- RAG service (FastAPI): http://localhost:8001

Node is configured with fallback URLs and route probing for compatibility:

- RAG base URLs: RAG_SERVICE_URL and RAG_FALLBACK_URL
- Query paths: /rag, /api/rag
- Upload paths: /upload, /api/upload

## Request Flows

### 1) Document Upload Flow

Frontend endpoint:

- POST /api/upload-documents (to Node)

Node behavior:

- Accepts multiple files using multer
- Forwards multipart files to FastAPI /upload (or /api/upload)

FastAPI behavior:

1. Reads uploaded files
2. Extracts text from supported text-like formats
3. Chunks text into overlapping chunks
4. Embeds each chunk
5. Builds a FAISS index and stores metadata/chunks

Typical response:

- filesProcessed
- filesSkipped
- chunks

### 2) Chat Query Flow

Frontend endpoint:

- POST /chat (to Node), body: { message }

Node behavior:

- Forwards query to FastAPI /rag (or /api/rag)

FastAPI behavior:

1. Embeds the user query
2. Retrieves top-k nearest chunks from FAISS
3. Builds a context-grounded prompt
4. Calls LLM to generate final answer
5. Returns { answer }

## Key Python Modules

- rag_service/main.py
  - FastAPI app and endpoints: /health, /upload, /rag
- rag_service/ingestion/loader.py
  - File text extraction for uploads
- rag_service/ingestion/chunker.py
  - Chunking logic with overlap
- rag_service/ingestion/embedder.py
  - Embedding client + model selection
- rag_service/ingestion/indexer.py
  - FAISS index build/write
- rag_service/retrieval/retriever.py
  - FAISS index load + nearest-neighbor retrieval
- rag_service/generation/prompt.py
  - Context + question prompt construction
- rag_service/generation/llm.py
  - LLM client + generation call

## Storage

RAG artifacts are stored under rag_service/data:

- index.faiss: vector index
- chunks.pkl: chunk text metadata

If these files are missing or empty, retrieval cannot return useful context.

## RAG Folder and Files

Current folder tree:

```text
rag_service/
  config.py
  main.py
  requirement.txt
  data/
    chunk.pkl
    chunks.pkl
    index.faiss
    raw/
  generation/
    llm.py
    prompt.py
  ingestion/
    chunker.py
    embedder.py
    indexer.py
    loader.py
  retrieval/
    retriever.py
```

What each file does:

- rag_service/main.py
  - FastAPI entry point
  - Loads environment variables from project .env
  - Exposes /health, /upload, and /rag endpoints

- rag_service/config.py
  - Reserved place for shared config/constants (currently minimal)

- rag_service/requirement.txt
  - Python dependencies for the RAG service

- rag_service/ingestion/loader.py
  - Reads uploaded file bytes and decodes supported text formats

- rag_service/ingestion/chunker.py
  - Splits long text into overlapping chunks

- rag_service/ingestion/embedder.py
  - Builds embedding client and creates vectors for chunks/queries

- rag_service/ingestion/indexer.py
  - Builds and writes the FAISS index and chunk metadata files

- rag_service/retrieval/retriever.py
  - Loads FAISS index/chunks and returns top-k relevant chunks

- rag_service/generation/prompt.py
  - Builds the final context-grounded prompt template

- rag_service/generation/llm.py
  - Builds LLM client and generates final answer text

- rag_service/data/index.faiss
  - Serialized FAISS vector index used at query time

- rag_service/data/chunks.pkl
  - Serialized chunk list aligned with vector IDs

- rag_service/data/chunk.pkl
  - Legacy/older chunk artifact file

- rag_service/data/raw/
  - Optional raw document storage folder (currently empty)

## Environment Variables

Important variables used by the system:

- OPENROUTER_API_KEY
- OPENROUTER_MODEL
- RAG_SERVICE_URL (recommended: http://localhost:8001)
- RAG_FALLBACK_URL (optional fallback)
- RAG_CHAT_MODEL (optional override for chat generation)
- RAG_EMBED_MODEL (optional override for embedding model)
- OPENAI_API_KEY (optional alternative key)
- OPENAI_BASE_URL (optional override)

## Startup Order

1. Start FastAPI RAG service first.
2. Start Node server second.
3. Upload documents.
4. Ask questions in chat.

## Why Upload Errors Usually Happen

Most upload failures come from one of these:

- RAG service is not running
- Wrong port (8000 vs 8001 mismatch)
- Python dependencies not installed in active interpreter
- Missing API key for embedding/generation

Quick checks:

- GET http://localhost:8001/health should return {"status":"ok"}
- Node logs should show successful proxy calls to RAG upload/query endpoints

## Summary

This RAG system combines:

- Retrieval (FAISS over embedded document chunks)
- Augmentation (injecting retrieved context into prompts)
- Generation (LLM answers grounded in retrieved content)

The Node app is a stable interface for the frontend, while FastAPI handles the full RAG pipeline.
