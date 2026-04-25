import os

from openai import OpenAI


def _build_client() -> OpenAI:
    openai_key = os.getenv("OPENAI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")

    api_key = openai_key or openrouter_key
    if not api_key:
        raise RuntimeError("Missing API key. Set OPENAI_API_KEY or OPENROUTER_API_KEY.")

    kwargs = {"api_key": api_key}
    explicit_base_url = os.getenv("OPENAI_BASE_URL")
    if explicit_base_url:
        kwargs["base_url"] = explicit_base_url
    elif openrouter_key and not openai_key:
        kwargs["base_url"] = "https://openrouter.ai/api/v1"

    return OpenAI(**kwargs)

def embed(text):
    client = _build_client()
    model = os.getenv("RAG_EMBED_MODEL") or "openai/text-embedding-3-small"

    return client.embeddings.create(
        model=model,
        input=text
    ).data[0].embedding


import concurrent.futures

def embed_batch_with_usage(texts: list[str]):
    if not texts:
        return {"embeddings": [], "usage": {}}

    client = _build_client()
    model = os.getenv("RAG_EMBED_MODEL") or "openai/text-embedding-3-small"

    all_embeddings = [None] * len(texts)
    total_prompt = 0
    total_tokens = 0
    
    def fetch_embedding(idx_and_text):
        idx, text = idx_and_text
        try:
            response = client.embeddings.create(
                model=model,
                input=text
            )
            emb = response.data[0].embedding
            usage = response.usage
            return idx, emb, usage
        except Exception as e:
            print(f"Error embedding chunk {idx}: {e}")
            return idx, None, None

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(fetch_embedding, enumerate(texts)))

    for idx, emb, usage in results:
        all_embeddings[idx] = emb
        if usage:
            total_prompt += getattr(usage, "prompt_tokens", 0)
            total_tokens += getattr(usage, "total_tokens", 0)
            
    # Remove any failed embeddings
    filtered_embeddings = [emb for emb in all_embeddings if emb is not None]

    return {
        "embeddings": filtered_embeddings,
        "usage": {
            "prompt_tokens": total_prompt,
            "total_tokens": total_tokens
        }
    }