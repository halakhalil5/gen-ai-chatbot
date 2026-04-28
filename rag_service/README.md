# RAG System: Image Processing and Chunking Algorithms

## Image Processing Overview

The image processing pipeline in this RAG (Retrieval-Augmented Generation) system is designed to extract textual and visual information from images for downstream retrieval and generation tasks. The process is as follows:

1. **Image Loading**: Images are loaded as raw bytes, typically from supported formats such as PNG, JPG, JPEG, WEBP, and GIF.
2. **Text Extraction**: The function `extract_text_from_image_bytes` (see `rag_service/ingestion/image_parser.py`) is used to extract text from images. This function:
    - Encodes the image in base64 and constructs a data URL.
    - Sends the image to a vision-capable LLM (default: GPT-4o, configurable via environment variables).
    - Prompts the model to return a transcript of any text and a brief description of visual elements.
    - Returns the extracted text and description for further processing.
3. **Multimodal Embedding**: For retrieval, both text and images are embedded into a shared vector space using a CLIP-based model (`clip-ViT-B-32`) via the `SentenceTransformer` library (see `rag_service/ingestion/multimodal_embedder.py`).

## Chunking Algorithm

Text (including text extracted from images) is split into manageable chunks before embedding and indexing. The chunking algorithm is implemented in `rag_service/ingestion/chunker.py` and works as follows:

- **Chunk Size**: The default chunk size is 900 characters.
- **Overlap**: Chunks overlap by 120 characters to preserve context across boundaries.
- **Algorithm**:
    1. Strip whitespace from the input text.
    2. Iterate through the text, extracting segments of `chunk_size` characters.
    3. After each chunk, move forward by `chunk_size - overlap` characters, ensuring overlap between consecutive chunks.
    4. Continue until the entire text is chunked.

This approach ensures that context is preserved across chunk boundaries, which is important for retrieval quality.

## References
- Image parsing: `rag_service/ingestion/image_parser.py`
- Chunking: `rag_service/ingestion/chunker.py`
- Multimodal embedding: `rag_service/ingestion/multimodal_embedder.py`

---
For more details, see the respective source files or contact the project maintainers.
