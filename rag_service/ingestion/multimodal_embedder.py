import torch
from sentence_transformers import SentenceTransformer
from PIL import Image
from pathlib import Path

# Load the CLIP model
# clip-ViT-B-32 is a good balance between speed and performance
model_name = "clip-ViT-B-32"
model = None

def _get_model():
    global model
    if model is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = SentenceTransformer(model_name, device=device)
    return model

def embed_text(text: str):
    """Embed text into the multimodal CLIP space."""
    m = _get_model()
    return m.encode(text).tolist()

def embed_text_batch(texts: list[str]):
    """Embed a batch of strings into CLIP space."""
    if not texts:
        return []
    m = _get_model()
    # model.encode handles batching efficiently
    embeddings = m.encode(texts, batch_size=32, show_progress_bar=False)
    return embeddings.tolist()

def embed_image(image_source):
    """
    Embed an image into the multimodal CLIP space.
    image_source can be a path (str) or a PIL Image object.
    """
    m = _get_model()
    if isinstance(image_source, (str, Path)):
        img = Image.open(image_source)
    else:
        img = image_source
    
    return m.encode(img).tolist()
