import time
import logging
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
import os
from rag import rag

logger = logging.getLogger("IRAB-Watcher")

class ProjectHandler(FileSystemEventHandler):
    def __init__(self, manager=None, loop=None):
        self.manager = manager
        self.loop = loop
        self.valid_exts = ('.js', '.json', '.py', '.html', '.css', '.md')

    def should_ignore(self, path):
        filename = os.path.basename(path)
        if filename.startswith('.') or not filename.endswith(self.valid_exts):
            return True
        if 'backend' in path.split(os.sep) or '.git' in path.split(os.sep):
            return True
        if '-journal' in filename or '.sqlite3' in filename:
            return True
        return False

    def on_modified(self, event):
        if not event.is_directory and not self.should_ignore(event.src_path):
            filename = os.path.basename(event.src_path)
            logger.info(f"File modified: {event.src_path}")
            rag.ingest_file(event.src_path)
            
            # Proactive UI Reaction
            if self.manager and self.loop:
                coro = self.manager.broadcast({
                    "type": "SET_STATE",
                    "data": "OBSERVING",
                    "detail": f"I saw you changed {filename}!"
                })
                asyncio.run_coroutine_threadsafe(coro, self.loop)

    def on_created(self, event):
        if not event.is_directory and not self.should_ignore(event.src_path):
            logger.info(f"File created: {event.src_path}")
            rag.ingest_file(event.src_path)

class IrabWatcher:
    def __init__(self, path_to_watch, manager=None, loop=None):
        self.path = path_to_watch
        self.loop = loop
        self.observer = Observer()
        self.handler = ProjectHandler(manager=manager, loop=self.loop)

    def start(self):
        logger.info(f"Starting file watcher on: {self.path}")
        self.observer.schedule(self.handler, self.path, recursive=True)
        self.observer.start()
        
        # Initial scan disabled to prevent segfaults on startup
        # try:
        #    rag.ingest_project()
        # except Exception as e:
        #    logger.error(f"Initial RAG ingestion failed: {e}")

    def stop(self):
        self.observer.stop()
        self.observer.join()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    # Assume watching parent dir
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    watcher = IrabWatcher(root)
    watcher.start()
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        watcher.stop()