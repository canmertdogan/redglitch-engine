import os
import logging
import chromadb
from chromadb.config import Settings

# Disable tokenizers parallelism to prevent multiprocessing crashes in asyncio
os.environ["TOKENIZERS_PARALLELISM"] = "false"

from sentence_transformers import SentenceTransformer

logger = logging.getLogger("IRAB-RAG")

class RAGSystem:
    def __init__(self, project_root="."):
        self.project_root = project_root
        
        # Initialize ChromaDB (Persistent)
        db_path = os.path.join(os.path.dirname(__file__), "chroma_db")
        self.client = chromadb.PersistentClient(path=db_path)
        
        # Get collection without explicit embedding function to avoid conflicts
        self.collection = self.client.get_or_create_collection(name="ketebe_project")
        
        # Initialize embedder immediately on CPU
        logger.info("Loading Embedding Model (CPU)...")
        try:
            self.embedder = SentenceTransformer('all-MiniLM-L6-v2', device='cpu')
            logger.info("RAG System initialized with CPU embedder.")
        except Exception as e:
            logger.error(f"Failed to load embedder: {e}")
            self.embedder = None

    def _ensure_embedder(self):
        return self.embedder is not None

    def ingest_project(self):
        """Scans the entire project and indexes valid files."""
        if not self._ensure_embedder(): return
        logger.info("Starting full project ingestion...")
        count = 0
        
        # Define ignore patterns
        ignore_dirs = {'.git', 'node_modules', 'dist', 'build', 'backend', '.gemini', 'chroma_db', '__pycache__', '.vscode', '.idea', 'android', 'ios'}
        valid_exts = {'.js', '.json', '.md', '.html', '.css', '.py', '.vsl'}

        batch_docs = []
        batch_meta = []
        batch_ids = []
        BATCH_SIZE = 50

        for root, dirs, files in os.walk(self.project_root):
            # Skip entire backend directory
            if 'backend' in root.split(os.sep):
                dirs[:] = [] # Clear dirs to stop recursion
                continue

            # Prune other ignored directories
            dirs[:] = [d for d in dirs if d not in ignore_dirs and not d.startswith('.')]
            
            for file in files:
                # Ignore specific system and database files
                if file.startswith('.') or file.endswith(('-journal', '.tmp', '.lock', '.sqlite3', '.gguf')):
                    continue

                if any(file.endswith(ext) for ext in valid_exts) and not file.startswith('.'):
                    file_path = os.path.join(root, file)
                    
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                            
                        if content.strip():
                            rel_path = os.path.relpath(file_path, self.project_root)
                            
                            # CHUNKING STRATEGY: 2000 chars with 200 char overlap
                            chunk_size = 2000
                            overlap = 200
                            
                            for i in range(0, len(content), chunk_size - overlap):
                                chunk = content[i : i + chunk_size]
                                chunk_id = f"{rel_path}_chunk_{i}"
                                
                                batch_docs.append(chunk)
                                batch_meta.append({"source": rel_path, "offset": i})
                                batch_ids.append(chunk_id)
                                count += 1
                                
                                if len(batch_docs) >= BATCH_SIZE:
                                    # Manually compute embeddings on CPU (disable multiprocessing to avoid crashes)
                                    embeddings = self.embedder.encode(batch_docs, show_progress_bar=False, convert_to_numpy=True).tolist()
                                    self.collection.upsert(
                                        documents=batch_docs,
                                        embeddings=embeddings,
                                        metadatas=batch_meta,
                                        ids=batch_ids
                                    )
                                    batch_docs = []
                                    batch_meta = []
                                    batch_ids = []
                            
                    except Exception as e:
                        logger.warning(f"Skipping {file_path}: {e}")

        if batch_docs:
            embeddings = self.embedder.encode(batch_docs, show_progress_bar=False, convert_to_numpy=True).tolist()
            self.collection.upsert(
                documents=batch_docs,
                embeddings=embeddings,
                metadatas=batch_meta,
                ids=batch_ids
            )
            
        logger.info(f"Ingested {count} files into Knowledge Base.")

    def ingest_file(self, file_path):
        """Updates a single file in the index with proper chunking."""
        if not self._ensure_embedder(): return
        
        # Safety check for ignored files/folders
        filename = os.path.basename(file_path)
        valid_exts = {'.js', '.json', '.md', '.html', '.css', '.py', '.vsl'}
        
        if filename.startswith('.') or not any(file_path.endswith(ext) for ext in valid_exts):
            return
        if 'backend' in file_path.split(os.sep) or '.git' in file_path.split(os.sep):
            return
        if '-journal' in filename or '.sqlite3' in filename:
            return

        try:
            rel_path = os.path.relpath(file_path, self.project_root)
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            if content.strip():
                # First, remove old chunks for this file
                self.collection.delete(where={"source": rel_path})
                
                # CHUNKING STRATEGY: 2000 chars with 200 char overlap
                chunk_size = 2000
                overlap = 200
                
                batch_docs = []
                batch_meta = []
                batch_ids = []
                
                for i in range(0, len(content), chunk_size - overlap):
                    chunk = content[i : i + chunk_size]
                    chunk_id = f"{rel_path}_chunk_{i}"
                    
                    batch_docs.append(chunk)
                    batch_meta.append({"source": rel_path, "offset": i})
                    batch_ids.append(chunk_id)
                
                if batch_docs:
                    embeddings = self.embedder.encode(batch_docs, show_progress_bar=False, convert_to_numpy=True).tolist()
                    self.collection.upsert(
                        documents=batch_docs,
                        embeddings=embeddings,
                        metadatas=batch_meta,
                        ids=batch_ids
                    )
                
                logger.info(f"Updated index (Real-time): {rel_path} ({len(batch_docs)} chunks)")
        except Exception as e:
            if os.path.exists(file_path):
                logger.error(f"Failed to ingest {file_path}: {e}")

    def query(self, query_text, n_results=3):
        """Retrieves and ranks relevant code snippets."""
        if not self._ensure_embedder(): return ""
        try:
            query_embeddings = self.embedder.encode(
                [query_text], 
                show_progress_bar=False, 
                convert_to_numpy=True
            ).tolist()
            
            # Retrieve more than we need to allow for better ranking/filtering
            raw_results = self.collection.query(
                query_embeddings=query_embeddings,
                n_results=n_results * 2
            )
            
            # Format and Filter (Similarity is 1 - distance in Chroma)
            results = []
            if raw_results['documents']:
                for i, doc in enumerate(raw_results['documents'][0]):
                    dist = raw_results['distances'][0][i]
                    score = 1.0 - dist
                    
                    # Threshold for relevance
                    if score < 0.2: continue 
                    
                    meta = raw_results['metadatas'][0][i]
                    source = meta.get('source', 'unknown')
                    
                    results.append({
                        "text": doc,
                        "source": source,
                        "score": score
                    })

            # Sort by score descending and take top N
            results.sort(key=lambda x: x['score'], reverse=True)
            top_results = results[:n_results]
            
            context_parts = []
            for r in top_results:
                context_parts.append(f"--- FILE: {r['source']} (Relevance: {round(r['score']*100)}%) ---\n{r['text']}\n")
            
            return "\n".join(context_parts)
        except Exception as e:
            logger.error(f"Query failed: {e}")
            return ""

# Singleton
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
rag = RAGSystem(PROJECT_ROOT)