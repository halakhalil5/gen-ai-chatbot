import faiss
import pickle
import numpy as np
from pathlib import Path
from ingestion.embedder import embed

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
INDEX_PATH = DATA_DIR / "index.faiss"
CHUNKS_PATH = DATA_DIR / "chunks.pkl"

user_cache = {}  # {user_id: {"index": index, "chunks": chunks}}


def _load_index_for_user(user_id):
    if user_id in user_cache:
        return user_cache[user_id]

    user_dir = DATA_DIR / user_id
    index_path = user_dir / "index.faiss"
    chunks_path = user_dir / "chunks.pkl"

    if not index_path.exists() or not chunks_path.exists():
        return None

    try:
        index = faiss.read_index(str(index_path))
        with open(chunks_path, "rb") as f:
            chunks = pickle.load(f)
        
        user_cache[user_id] = {"index": index, "chunks": chunks}
        return user_cache[user_id]
    except Exception:
        return None

def reload_index(user_id):
    if user_id in user_cache:
        del user_cache[user_id]
    _load_index_for_user(user_id)

def retrieve(query, user_id, k=3):
    data = _load_index_for_user(user_id)

    if not data or not data["index"] or not data["chunks"]:
        return []

    index = data["index"]
    chunks = data["chunks"]

    q_emb = embed(query)
    top_k = min(k, len(chunks))
    _, indices = index.search(np.array([q_emb]).astype("float32"), top_k)
    return [chunks[i] for i in indices[0] if 0 <= i < len(chunks)]