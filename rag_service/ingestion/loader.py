import io
from pathlib import Path
from pypdf import PdfReader
from docx import Document
from ingestion.image_parser import extract_text_from_image_bytes


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
    elif suffix == ".pdf":
        try:
            reader = PdfReader(io.BytesIO(raw))
            return "\n".join(page.extract_text() for page in reader.pages if page.extract_text())
        except Exception as e:
            print(f"Failed to parse PDF {filename}: {e}")
            return ""
    elif suffix == ".docx":
        try:
            doc = Document(io.BytesIO(raw))
            return "\n".join(paragraph.text for paragraph in doc.paragraphs)
        except Exception as e:
            print(f"Failed to parse Word doc {filename}: {e}")
            return ""
    elif suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return extract_text_from_image_bytes(raw, filename)

    return ""
