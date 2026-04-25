import faiss
import pickle
import numpy as np
from pathlib import Path
from ingestion.embedder import embed

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
INDEX_PATH = DATA_DIR / "index.faiss"
CHUNKS_PATH = DATA_DIR / "chunks.pkl"

index = None
chunks = []


def _load_index_if_needed():
    global index, chunks

    if index is not None and chunks:
        return

    if not INDEX_PATH.exists() or not CHUNKS_PATH.exists():
        index = None
        chunks = []
        return

    index = faiss.read_index(str(INDEX_PATH))
    with open(CHUNKS_PATH, "rb") as f:
        chunks = pickle.load(f)

def reload_index():
    global index, chunks
    index = None
    chunks = []
    _load_index_if_needed()

def retrieve(query, k=3):
    _load_index_if_needed()

    if index is None or not chunks:
        return []

    q_emb = embed(query)
    top_k = min(k, len(chunks))
    _, indices = index.search(np.array([q_emb]).astype("float32"), top_k)
    return [chunks[i] for i in indices[0] if 0 <= i < len(chunks)]