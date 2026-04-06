def chunk_text(text: str, chunk_size: int = 900, overlap: int = 120) -> list[str]:
    clean = text.strip()
    if not clean:
        return []

    chunks = []
    start = 0
    text_length = len(clean)

    while start < text_length:
        end = min(start + chunk_size, text_length)
        chunk = clean[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= text_length:
            break

        start = max(end - overlap, 0)

    return chunks
