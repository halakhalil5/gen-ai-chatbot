import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from generation.llm import generate
from generation.prompt import build_prompt
from ingestion.chunker import chunk_text
from ingestion.embedder import embed_batch_with_usage
from ingestion.indexer import build_index
from ingestion.loader import load_text_from_bytes
from retrieval.retriever import retrieve, reload_index

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
    user_id: str = "user_001"


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/rag")
async def rag_chat(payload: RAGQuery):
    query = payload.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required.")

    chunks = retrieve(query, payload.user_id)
    prompt = build_prompt(query, chunks)
    result = generate(prompt)
    return {"answer": result["answer"], "usage": result["usage"]}


@app.post("/upload")
async def upload_documents(
    files: list[UploadFile] = File(...),
    user_id: str = Form("user_001")
):
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required.")

    all_chunks = []
    processed = []
    skipped = []

    import time
    start_time = time.time()
    
    with open("debug.log", "a", encoding="utf-8") as f:
        f.write(f"\n--- New Upload Started at {time.time()} ---\n")
    
    user_dir = Path(__file__).resolve().parents[0] / "data" / user_id / "files"
    user_dir.mkdir(parents=True, exist_ok=True)

    for file in files:
        t0 = time.time()
        with open("debug.log", "a", encoding="utf-8") as f:
            f.write(f"Starting to load {file.filename}...\n")
            
        raw = await file.read()
        
        file_path = user_dir / (file.filename or "unknown")
        with open(file_path, "wb") as f:
            f.write(raw)

        text = load_text_from_bytes(file.filename or "unknown", raw)
        
        with open("debug.log", "a", encoding="utf-8") as f:
            f.write(f"Loaded {file.filename} in {time.time() - t0:.2f}s (Extracted {len(text)} chars)\n")

        if not text.strip():
            skipped.append(file.filename or "unknown")
            continue

        chunks = chunk_text(text)
        if not chunks:
            skipped.append(file.filename or "unknown")
            continue

        all_chunks.extend(chunks)
        processed.append(file.filename or "unknown")

    t1_chunk = time.time()
    with open("debug.log", "a", encoding="utf-8") as f:
        f.write(f"Total loading & chunking took {t1_chunk - start_time:.2f}s for {len(all_chunks)} chunks\n")

    if not all_chunks:
        raise HTTPException(status_code=400, detail="No readable content found in uploaded files.")

    t1 = time.time()
    with open("debug.log", "a", encoding="utf-8") as f:
        f.write(f"Starting embeddings for {len(all_chunks)} chunks...\n")
        
    embed_result = embed_batch_with_usage(all_chunks)
    embeddings = embed_result["embeddings"]
    
    t2_embed = time.time()
    with open("debug.log", "a", encoding="utf-8") as f:
        f.write(f"Embedding {len(all_chunks)} chunks took {t2_embed - t1:.2f}s\n")
    
    usage = embed_result.get("usage", {})
    embedding_prompt_tokens = usage.get("prompt_tokens", 0)
    embedding_total_tokens = usage.get("total_tokens", 0)

    t2 = time.time()
    with open("debug.log", "a", encoding="utf-8") as f:
        f.write(f"Starting index build...\n")
        
    build_index(embeddings, all_chunks, user_id)
    reload_index(user_id)
    t3_index = time.time()
    
    with open("debug.log", "a", encoding="utf-8") as f:
        f.write(f"Index build & reload took {t3_index - t2:.2f}s\n")
        f.write(f"Total upload request took {t3_index - start_time:.2f}s\n")

    return {
        "message": "Documents indexed successfully.",
        "filesProcessed": len(processed),
        "filesSkipped": len(skipped),
        "chunks": len(all_chunks),
        "embeddingUsage": {
            "prompt_tokens": embedding_prompt_tokens,
            "total_tokens": embedding_total_tokens,
        },
        "timings": {
            "load_and_chunk": round(t1_chunk - start_time, 2),
            "embed": round(t2_embed - t1, 2),
            "index": round(t3_index - t2, 2),
            "total": round(t3_index - start_time, 2)
        }
    }