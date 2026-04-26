import faiss
import numpy as np
import pickle
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
INDEX_PATH = DATA_DIR / "index.faiss"
CHUNKS_PATH = DATA_DIR / "chunks.pkl"

def build_index(embeddings, chunks, user_id):
    if not embeddings:
        raise ValueError("embeddings cannot be empty")

    user_dir = DATA_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    
    index_path = user_dir / "index.faiss"
    chunks_path = user_dir / "chunks.pkl"

    dim = len(embeddings[0])
    existing_chunks = []

    if index_path.exists() and chunks_path.exists():
        index = faiss.read_index(str(index_path))
        with open(chunks_path, "rb") as f:
            try:
                existing_chunks = pickle.load(f)
            except EOFError:
                existing_chunks = []
    else:
        index = faiss.IndexFlatL2(dim)

    index.add(np.array(embeddings).astype("float32"))
    existing_chunks.extend(chunks)

    faiss.write_index(index, str(index_path))

    with open(chunks_path, "wb") as f:
        pickle.dump(existing_chunks, f)