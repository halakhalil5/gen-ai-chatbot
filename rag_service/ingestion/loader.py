from pathlib import Path


def _decode_text(raw: bytes) -> str:
    for encoding in ("utf-8", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return ""


def load_text_from_bytes(filename: str, raw: bytes) -> str:
    suffix = Path(filename).suffix.lower()

    # Start with text-like files; unsupported binary files are ignored.
    if suffix in {".txt", ".md", ".csv", ".json", ".log", ".py", ".js", ".html", ".css"}:
        return _decode_text(raw)

    return ""
