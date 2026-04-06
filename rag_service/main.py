import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

from generation.llm import generate
from generation.prompt import build_prompt
from ingestion.chunker import chunk_text
from ingestion.embedder import embed_with_usage
from ingestion.indexer import build_index
from ingestion.loader import load_text_from_bytes
from retrieval.retriever import retrieve

app = FastAPI()


def _load_env_file() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()

class RAGQuery(BaseModel):
    query: str


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/rag")
async def rag_chat(payload: RAGQuery):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required.")

    chunks = retrieve(query)
    prompt = build_prompt(query, chunks)
    result = generate(prompt)
    return {"answer": result["answer"], "usage": result["usage"]}


@app.post("/upload")
async def upload_documents(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    all_chunks = []
    processed = []
    skipped = []

    for file in files:
        raw = await file.read()
        text = load_text_from_bytes(file.filename or "unknown", raw)

        if not text.strip():
            skipped.append(file.filename or "unknown")
            continue

        chunks = chunk_text(text)
        if not chunks:
            skipped.append(file.filename or "unknown")
            continue

        all_chunks.extend(chunks)
        processed.append(file.filename or "unknown")

    if not all_chunks:
        raise HTTPException(status_code=400, detail="No readable content found in uploaded files.")

    embeddings = []
    embedding_prompt_tokens = 0
    embedding_total_tokens = 0

    for chunk in all_chunks:
        embed_result = embed_with_usage(chunk)
        embeddings.append(embed_result["embedding"])

        chunk_usage = embed_result.get("usage") or {}
        embedding_prompt_tokens += int(chunk_usage.get("prompt_tokens") or 0)
        embedding_total_tokens += int(chunk_usage.get("total_tokens") or 0)

    build_index(embeddings, all_chunks)

    return {
        "message": "Documents indexed successfully.",
        "filesProcessed": len(processed),
        "filesSkipped": len(skipped),
        "chunks": len(all_chunks),
        "embeddingUsage": {
            "prompt_tokens": embedding_prompt_tokens,
            "total_tokens": embedding_total_tokens,
        },
    }