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

def generate(prompt):
    client = _build_client()
    model = os.getenv("RAG_CHAT_MODEL") or os.getenv("OPENROUTER_MODEL") or "openai/gpt-4-0314"

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}]
    )

    usage = response.usage
    usage_payload = {
        "prompt_tokens": getattr(usage, "prompt_tokens", None),
        "completion_tokens": getattr(usage, "completion_tokens", None),
        "total_tokens": getattr(usage, "total_tokens", None),
    }

    return {
        "answer": response.choices[0].message.content,
        "usage": usage_payload,
    }