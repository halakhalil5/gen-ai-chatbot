import base64
import os
from generation.llm import _build_client

def extract_text_from_image_bytes(raw: bytes, filename: str) -> str:
    client = _build_client()
    # Defaulting to gpt-4o as it has excellent vision capabilities
    model = os.getenv("RAG_VISION_MODEL") or "gpt-4o"
    if os.getenv("OPENROUTER_API_KEY") and not os.getenv("OPENAI_API_KEY"):
        model = os.getenv("RAG_VISION_MODEL") or os.getenv("OPENROUTER_MODEL") or "openai/gpt-4o"

    # Determine the mime type from the filename extension
    ext = filename.lower().split('.')[-1]
    mime_type = f"image/{ext}" if ext in ["png", "jpeg", "webp", "gif"] else "image/jpeg"
    if ext == "jpg":
        mime_type = "image/jpeg"

    base64_image = base64.b64encode(raw).decode('utf-8')
    image_url = f"data:{mime_type};base64,{base64_image}"

    prompt = (
        "Please provide a complete transcript of any text found in this image. "
        "If there are any diagrams or important visual elements, briefly describe them. "
        "Return ONLY the extracted text and description."
    )

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {"url": image_url}
                        }
                    ]
                }
            ],
            max_tokens=1500
        )
        return response.choices[0].message.content or ""
    except Exception as e:
        print(f"Error extracting text from image {filename}: {e}")
        return ""
