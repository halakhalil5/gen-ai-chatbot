# Nova Chat: Multi-Modal RAG AI Console

Nova Chat is a powerful, multi-user AI console that combines Large Language Models with a sophisticated Multi-Modal Retrieval-Augmented Generation (RAG) system. It supports text documents, PDFs, and images, allowing for a seamless blending of visual and textual knowledge.

## 🚀 Key Features

### 🖼️ Multi-Modal RAG
- **Image Support**: Upload images (PNG, JPG, WEBP) alongside your documents.
- **Vision AI Captioning**: Automatically generates searchable descriptions of images using GPT-4o Vision.
- **CLIP Embeddings**: Uses the `clip-ViT-B-32` model to place text and images in the same vector space.
- **Visual Search**: Supports **Text-to-Image** (finding images by description) and **Image-to-Image** (finding similar images by uploading a reference in the chat).

### 👥 Multi-User Isolation
- **User Sessions**: Each user (identified by "User Name") has their own isolated workspace.
- **Private Data**: Documents and FAISS vector indices are stored per user in `rag_service/data/<user_id>`, ensuring no data leakage between users.

### 💾 Persistent Local Storage
- **Local FAISS Index**: Vector indices are saved to disk and reloaded automatically.
- **Raw File Storage**: Uploaded files are preserved on the server, allowing the AI to reference original source materials.

---

## 🛠️ Setup & Installation

### 1. Prerequisites
- Node.js (v18+)
- Python 3.9+

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
OPENROUTER_API_KEY=your_key_here
PORT=3000
RAG_SERVICE_URL=http://localhost:8001
# Optional:
# RAG_VISION_MODEL=openai/gpt-4o  (Model used for image captioning)
```

### 3. Frontend & Proxy (Node.js)
```bash
npm install
npm run dev
```

### 4. RAG Service (Python)
It is recommended to use a virtual environment:
```bash
cd rag_service
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Mac/Linux

pip install -r requirement.txt
pip install sentence-transformers torch torchvision
```

### 5. Start the RAG Service
```bash
uvicorn main:app --port 8001 --reload
```

---

## 📖 Usage Guide

1.  **Identity**: Enter your name in the **User Name** field. This isolates your documents from others.
2.  **Knowledge Base**: Click the **Index** button to upload PDFs, Docs, or Images.
    - *Note: On the first run, the system will download a 600MB CLIP model. Please wait for the download to finish in the terminal.*
3.  **Chat**: Ask questions about your documents.
4.  **Visual Query**: Click the **Image Icon** in the chat bar to upload an image and ask "What is similar to this?" or "Explain this diagram based on my files."

---

## 🔍 Troubleshooting

- **"Module Not Found"**: Ensure you have installed the dependencies *inside* your virtual environment.
- **Slow Indexing**: The first upload is slow because it downloads the CLIP model. Subsequent uploads use batch processing and are much faster.
- **Dimension Mismatch**: If you see errors about "Dimension Mismatch," the system will automatically reset your index to the new Multi-Modal format. Simply re-upload your files.
- **UI Cut Off**: The layout is responsive; if elements seem missing, try resizing your window or checking the "User Name" input alignment.

---

## 🏗️ Architecture
- **Frontend**: Vanilla JS + Modern CSS (Space Grotesk typography).
- **Backend**: Node.js (Express) acting as an intelligent proxy.
- **RAG Engine**: FastAPI + FAISS + Sentence-Transformers (CLIP).
