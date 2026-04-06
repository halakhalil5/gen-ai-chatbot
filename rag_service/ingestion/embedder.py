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


def embed_with_usage(text):
    client = _build_client()
    model = os.getenv("RAG_EMBED_MODEL") or "openai/text-embedding-3-small"

    response = client.embeddings.create(
        model=model,
        input=text
    )

    usage = response.usage
    usage_payload = {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }

    return {
        "embedding": response.data[0].embedding,
        "usage": usage_payload,
    }