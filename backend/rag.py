import os
import logging
import json
import gc
import pickle
import threading
import numpy as np

# Disable tokenizers parallelism and threading to prevent semaphore leaks
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

from sentence_transformers import SentenceTransformer

logger = logging.getLogger("IRAB-RAG")


class NumpyVectorStore:
    """
    Pure Python/numpy vector store. No Rust, no Tokio, no async runtime conflicts.
    Persists to a single pickle file. Thread-safe via a RLock.
    """

    def __init__(self, store_path):
        self.store_path = store_path
        self._lock = threading.RLock()
        self._ids = []          # list of str
        self._documents = []    # list of str
        self._metadatas = []    # list of dict
        self._embeddings = None # numpy array (N, D) or None if empty
        self._load()

    def _load(self):
        if os.path.exists(self.store_path):
            try:
                with open(self.store_path, 'rb') as f:
                    data = pickle.load(f)
                self._ids = data.get('ids', [])
                self._documents = data.get('documents', [])
                self._metadatas = data.get('metadatas', [])
                emb = data.get('embeddings')
                self._embeddings = np.array(emb, dtype=np.float32) if emb is not None and len(emb) > 0 else None
                logger.info(f"Loaded vector store: {len(self._ids)} chunks from {self.store_path}")
            except Exception as e:
                logger.warning(f"Could not load vector store ({e}), starting fresh.")
                self._reset()

    def _reset(self):
        self._ids = []
        self._documents = []
        self._metadatas = []
        self._embeddings = None

    def _save(self):
        try:
            data = {
                'ids': self._ids,
                'documents': self._documents,
                'metadatas': self._metadatas,
                'embeddings': self._embeddings.tolist() if self._embeddings is not None else []
            }
            tmp = self.store_path + '.tmp'
            with open(tmp, 'wb') as f:
                pickle.dump(data, f)
            os.replace(tmp, self.store_path)
        except Exception as e:
            logger.error(f"Failed to save vector store: {e}")

    def count(self):
        with self._lock:
            return len(self._ids)

    def upsert(self, documents, embeddings, metadatas, ids):
        with self._lock:
            emb_array = np.array(embeddings, dtype=np.float32)
            for i, doc_id in enumerate(ids):
                if doc_id in self._ids:
                    idx = self._ids.index(doc_id)
                    self._documents[idx] = documents[i]
                    self._metadatas[idx] = metadatas[i]
                    self._embeddings[idx] = emb_array[i]
                else:
                    self._ids.append(doc_id)
                    self._documents.append(documents[i])
                    self._metadatas.append(metadatas[i])
                    if self._embeddings is None:
                        self._embeddings = emb_array[i:i+1]
                    else:
                        self._embeddings = np.vstack([self._embeddings, emb_array[i]])
            self._save()

    def delete_by_source(self, source):
        with self._lock:
            keep = [i for i, m in enumerate(self._metadatas) if m.get('source') != source]
            if len(keep) == len(self._ids):
                return
            self._ids = [self._ids[i] for i in keep]
            self._documents = [self._documents[i] for i in keep]
            self._metadatas = [self._metadatas[i] for i in keep]
            self._embeddings = self._embeddings[keep] if (self._embeddings is not None and len(keep) > 0) else None
            self._save()

    def query(self, query_embedding, n_results):
        with self._lock:
            if self._embeddings is None or len(self._ids) == 0:
                return {'documents': [[]], 'metadatas': [[]], 'distances': [[]]}

            q = np.array(query_embedding, dtype=np.float32)
            # Cosine similarity
            norms = np.linalg.norm(self._embeddings, axis=1, keepdims=True)
            norms = np.where(norms == 0, 1e-10, norms)
            normed = self._embeddings / norms
            q_norm = q / (np.linalg.norm(q) + 1e-10)
            sims = normed @ q_norm  # (N,)

            n = min(n_results, len(self._ids))
            top_idx = np.argsort(sims)[::-1][:n]

            docs = [self._documents[i] for i in top_idx]
            metas = [self._metadatas[i] for i in top_idx]
            # distance = 1 - similarity (to match chromadb convention)
            dists = [float(1.0 - sims[i]) for i in top_idx]

            return {'documents': [docs], 'metadatas': [metas], 'distances': [dists]}


class RAGSystem:
    def __init__(self, project_root="."):
        self.project_root = project_root
        store_path = os.path.join(os.path.dirname(__file__), "vector_store.pkl")
        self._store = NumpyVectorStore(store_path)
        self._store_lock = threading.Lock()  # extra guard for ingest serialization

        logger.info("Loading Embedding Model (CPU)...")
        try:
            self.embedder = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
            logger.info("RAG System initialized with CPU embedder.")
        except Exception as e:
            logger.error(f"Failed to load embedder: {e}")
            self.embedder = None

    def _ensure_embedder(self):
        return self.embedder is not None

    def _json_to_text(self, data, filename):
        text_parts = [f"Data from {filename}:"]
        if isinstance(data, list):
            for item in data[:20]:
                if isinstance(item, dict):
                    name = item.get('name') or item.get('id') or item.get('title') or "Item"
                    desc = item.get('description') or item.get('desc') or ""
                    tags = item.get('tags') or ""
                    text_parts.append(f"- {name}: {desc}. Tags: {tags}")
        elif isinstance(data, dict):
            if 'assets' in data:
                for a in data['assets'][:15]:
                    text_parts.append(f"Asset '{a.get('id')}': a {a.get('type')} asset located at {a.get('path')}.")
            else:
                for k, v in list(data.items())[:20]:
                    if isinstance(v, (str, int, float, bool)):
                        text_parts.append(f"The {k} is {v}.")
                    elif isinstance(v, dict):
                        text_parts.append(f"The {k} contains settings: {str(v)[:100]}.")
        return "\n".join(text_parts)

    def ingest_project(self, force=False):
        """Scans the entire project and indexes valid files."""
        if not self._ensure_embedder():
            return

        if not force and self._store.count() > 0:
            logger.info(f"RAG index already has {self._store.count()} chunks. Skipping. Use force=True or /api/ai/rag/reindex to rebuild.")
            return

        logger.info("Starting full project ingestion (Context 3.0)...")
        count = 0

        ignore_dirs = {'.git', 'node_modules', 'dist', 'build', 'backend', '.gemini',
                       '__pycache__', '.vscode', '.idea', 'android', 'ios', 'chroma_db'}
        valid_exts = {'.js', '.json', '.md', '.html', '.css', '.py', '.vsl'}
        manifesto_files = {'README.md', 'MANIFESTO.md', 'package.json', 'ketebe.json'}

        batch_docs, batch_meta, batch_ids = [], [], []
        BATCH_SIZE = 10

        with self._store_lock:
            for root, dirs, files in os.walk(self.project_root):
                if 'backend' in root.split(os.sep):
                    dirs[:] = []
                    continue
                dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('.')]

                for file in files:
                    if file.startswith('.') or file.endswith(('-journal', '.tmp', '.lock', '.sqlite3', '.gguf', '.pkl')):
                        continue

                    is_manifesto = file in manifesto_files or 'architecture' in root or 'planmemory' in root
                    if not is_manifesto and not any(file.endswith(ext) for ext in valid_exts):
                        continue

                    file_path = os.path.join(root, file)
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                        if not content.strip():
                            continue

                        rel_path = os.path.relpath(file_path, self.project_root)
                        processed_content = content
                        if file.endswith('.json'):
                            try:
                                data = json.loads(content)
                                if isinstance(data, (dict, list)):
                                    processed_content = self._json_to_text(data, file)
                            except Exception:
                                pass

                        category = "manifesto" if is_manifesto else ("data" if file.endswith('.json') else ("docs" if file.endswith('.md') else "code"))

                        chunk_size, overlap = 2000, 200
                        for i in range(0, len(processed_content), chunk_size - overlap):
                            chunk = processed_content[i:i + chunk_size]
                            batch_docs.append(chunk)
                            batch_meta.append({"source": rel_path, "offset": i, "category": category, "priority": 2 if category == "manifesto" else 1})
                            batch_ids.append(f"{rel_path}_chunk_{i}")
                            count += 1

                            if len(batch_docs) >= BATCH_SIZE:
                                embeddings = self.embedder.encode(batch_docs, show_progress_bar=False, convert_to_numpy=True, batch_size=8).tolist()
                                self._store.upsert(batch_docs, embeddings, batch_meta, batch_ids)
                                batch_docs, batch_meta, batch_ids = [], [], []
                                gc.collect()

                    except Exception as e:
                        logger.warning(f"Skipping {file_path}: {e}")

            if batch_docs:
                embeddings = self.embedder.encode(batch_docs, show_progress_bar=False, convert_to_numpy=True, batch_size=8).tolist()
                self._store.upsert(batch_docs, embeddings, batch_meta, batch_ids)
                gc.collect()

        logger.info(f"Ingested {count} chunks.")

    def ingest_file(self, file_path):
        """Updates a single file in the index."""
        if not self._ensure_embedder():
            return

        filename = os.path.basename(file_path)
        valid_exts = {'.js', '.json', '.md', '.html', '.css', '.py', '.vsl'}
        manifesto_files = {'README.md', 'MANIFESTO.md', 'package.json', 'ketebe.json'}
        is_manifesto = filename in manifesto_files or 'architecture' in file_path or 'planmemory' in file_path

        if not is_manifesto and (filename.startswith('.') or not any(file_path.endswith(ext) for ext in valid_exts)):
            return
        if 'backend' in file_path.split(os.sep) or '.git' in file_path.split(os.sep):
            return
        if filename.endswith(('-journal', '.sqlite3', '.pkl')):
            return

        try:
            rel_path = os.path.relpath(file_path, self.project_root)
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            if not content.strip():
                return

            self._store.delete_by_source(rel_path)

            category = "manifesto" if is_manifesto else ("data" if file_path.endswith('.json') else ("docs" if file_path.endswith('.md') else "code"))
            chunk_size, overlap = 2000, 200
            batch_docs, batch_meta, batch_ids = [], [], []

            for i in range(0, len(content), chunk_size - overlap):
                chunk = content[i:i + chunk_size]
                batch_docs.append(chunk)
                batch_meta.append({"source": rel_path, "offset": i, "category": category, "priority": 2 if category == "manifesto" else 1})
                batch_ids.append(f"{rel_path}_chunk_{i}")

            if batch_docs:
                embeddings = self.embedder.encode(batch_docs, show_progress_bar=False, convert_to_numpy=True, batch_size=8).tolist()
                self._store.upsert(batch_docs, embeddings, batch_meta, batch_ids)

            logger.info(f"Updated index: {rel_path} [{category}]")
        except Exception as e:
            if os.path.exists(file_path):
                logger.error(f"Failed to ingest {file_path}: {e}")

    def query(self, query_text, n_results=3):
        """Retrieves and ranks relevant code snippets."""
        if not self._ensure_embedder():
            return ""
        try:
            q_emb = self.embedder.encode([query_text], show_progress_bar=False, convert_to_numpy=True).tolist()[0]
            raw = self._store.query(q_emb, n_results * 2)

            results = []
            if raw['documents']:
                for i, doc in enumerate(raw['documents'][0]):
                    dist = raw['distances'][0][i]
                    score = 1.0 - dist
                    if score < 0.2:
                        continue
                    meta = raw['metadatas'][0][i]
                    if meta.get('priority', 1) > 1:
                        score *= 1.2
                    results.append({"text": doc, "source": meta.get('source', 'unknown'), "score": score, "category": meta.get('category', 'unknown')})

            results.sort(key=lambda x: x['score'], reverse=True)
            top = results[:n_results]

            context_parts = []
            for r in top:
                tag = f"[{r['category'].upper()}]" if r['category'] != 'unknown' else ""
                context_parts.append(f"--- FILE: {r['source']} {tag} (Relevance: {round(r['score']*100)}%) ---\n{r['text']}\n")
            return "\n".join(context_parts)
        except Exception as e:
            logger.error(f"Query failed: {e}")
            return ""


# Singleton
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
rag = RAGSystem(PROJECT_ROOT)

