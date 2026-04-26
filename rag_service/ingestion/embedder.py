from ingestion.multimodal_embedder import embed_text as clip_embed_text, embed_text_batch as clip_embed_text_batch

def embed(text):
    return clip_embed_text(text)


def embed_batch_with_usage(texts: list[str]):
    if not texts:
        return {"embeddings": [], "usage": {}}

    try:
        embeddings = clip_embed_text_batch(texts)
        return {
            "embeddings": embeddings,
            "usage": {"prompt_tokens": 0, "total_tokens": 0}
        }
    except Exception as e:
        print(f"Error in batch embedding: {e}")
        return {"embeddings": [], "usage": {}}