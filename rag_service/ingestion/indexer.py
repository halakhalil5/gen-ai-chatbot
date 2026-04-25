import faiss
import numpy as np
import pickle
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
INDEX_PATH = DATA_DIR / "index.faiss"
CHUNKS_PATH = DATA_DIR / "chunks.pkl"

def build_index(embeddings, chunks):
    if not embeddings:
        raise ValueError("embeddings cannot be empty")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    dim = len(embeddings[0])

    existing_chunks = []
    if INDEX_PATH.exists() and CHUNKS_PATH.exists():
        index = faiss.read_index(str(INDEX_PATH))
        with open(CHUNKS_PATH, "rb") as f:
            try:
                existing_chunks = pickle.load(f)
            except EOFError:
                existing_chunks = []
    else:
        index = faiss.IndexFlatL2(dim)

    index.add(np.array(embeddings).astype("float32"))
    existing_chunks.extend(chunks)

    faiss.write_index(index, str(INDEX_PATH))

    with open(CHUNKS_PATH, "wb") as f:
        pickle.dump(existing_chunks, f)