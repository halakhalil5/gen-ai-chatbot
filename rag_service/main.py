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
    query: str = ""
    user_id: str = "user_001"
    image_query: str = "" # base64 encoded image


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/rag")
async def rag_chat(payload: RAGQuery):
    query = payload.query.strip()
    
    image_bytes = None
    if payload.image_query:
        import base64
        try:
            # Handle data URL prefix if present
            header = "base64,"
            if header in payload.image_query:
                payload.image_query = payload.image_query.split(header)[1]
            image_bytes = base64.b64decode(payload.image_query)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid image_query: {e}")

    if not query and not image_bytes:
        raise HTTPException(status_code=400, detail="query or image_query is required.")

    chunks = retrieve(query, payload.user_id, image_bytes=image_bytes)
    prompt = build_prompt(query, chunks)
    result = generate(prompt)
    
    # Clean chunks for JSON response (convert Path to str if needed)
    serialized_chunks = []
    for c in chunks:
        if isinstance(c, dict):
            serialized_chunks.append(c)
        else:
            serialized_chunks.append({"text": str(c), "metadata": {"type": "text"}})

    return {
        "answer": result["answer"],
        "usage": result["usage"],
        "context": serialized_chunks
    }


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

    import concurrent.futures

    def process_single_file(file_obj):
        try:
            # We need to read the file content inside the thread or pass it in
            # UploadFile.read() is async, so we should read it before passing to the thread
            return None # Placeholder for now, see below
        except Exception as e:
            return None

    # We will do it directly in a loop with a pool for the heavy part (captioning)
    file_data_list = []
    for file in files:
        raw = await file.read()
        file_path = user_dir / (file.filename or "unknown")
        with open(file_path, "wb") as f:
            f.write(raw)
        file_data_list.append((file.filename or "unknown", raw, file_path))

    def load_and_process(item):
        fname, raw, fpath = item
        text = load_text_from_bytes(fname, raw)
        return fname, text, fpath

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(load_and_process, file_data_list))

    try:
        for fname, text, fpath in results:
            if not text.strip():
                skipped.append(fname)
                continue

            suffix = Path(fname).suffix.lower()
            is_image = suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif"}

            if is_image:
                # Store relative path for frontend access
                relative_image_path = f"{user_id}/files/{fname}"
                all_chunks.append({
                    "text": text,
                    "metadata": {
                        "type": "image",
                        "source": fname,
                        "image_path": relative_image_path
                    }
                })
            else:
                chunks = chunk_text(text)
                for chunk in chunks:
                    all_chunks.append({
                        "text": chunk,
                        "metadata": {
                            "type": "text",
                            "source": fname
                        }
                    })
            processed.append(fname)

        t1_chunk = time.time()
        with open("debug.log", "a", encoding="utf-8") as f:
            f.write(f"Total loading & chunking took {t1_chunk - start_time:.2f}s for {len(all_chunks)} chunks\n")

        if not all_chunks:
            raise HTTPException(status_code=400, detail="No readable content found in uploaded files.")

        t1 = time.time()
        # Extract text content for embedding
        texts_to_embed = [c["text"] if isinstance(c, dict) else c for c in all_chunks]
        
        with open("debug.log", "a", encoding="utf-8") as f:
            f.write(f"Starting batch embedding for {len(texts_to_embed)} items...\n")
            
        embed_result = embed_batch_with_usage(texts_to_embed)
        embeddings = embed_result["embeddings"]
        
        t2_embed = time.time()
        with open("debug.log", "a", encoding="utf-8") as f:
            f.write(f"Embedding took {t2_embed - t1:.2f}s\n")
        
        usage = embed_result.get("usage", {})
        embedding_prompt_tokens = usage.get("prompt_tokens", 0)
        embedding_total_tokens = usage.get("total_tokens", 0)

        t2 = time.time()
        with open("debug.log", "a", encoding="utf-8") as f:
            f.write(f"Starting index build for user {user_id}...\n")
            
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
    except Exception as e:
        with open("debug.log", "a", encoding="utf-8") as f:
            f.write(f"FATAL ERROR in upload: {str(e)}\n")
            import traceback
            f.write(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))