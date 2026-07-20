import os
import multiprocessing

# Fix macOS fork crash: force 'spawn' start method before any ML imports
if multiprocessing.get_start_method(allow_none=True) != 'spawn':
    multiprocessing.set_start_method('spawn', force=True)

# Disable tokenizers parallelism BEFORE any ML imports to prevent multiprocessing crashes
os.environ["TOKENIZERS_PARALLELISM"] = "false"

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import json
import logging
import asyncio
import psutil
import requests
import re
from contextlib import asynccontextmanager
from brain import brain
from watcher import IrabWatcher
from rag import rag

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IRAB-Cortex")

# Silence uvicorn access logs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
# Also silence uvicorn.error logs that are just info
logging.getLogger("uvicorn.error").setLevel(logging.WARNING)

process = psutil.Process(os.getpid())
watcher = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Booting up Cortex...")
    asyncio.create_task(load_brain_task())
    asyncio.create_task(heartbeat_loop())
    yield
    # Shutdown
    logger.info("Shutting down Cortex...")
    if watcher:
        watcher.stop()

async def heartbeat_loop():
    while True:
        # Print to stdout for Electron CortexManager to see
        print("HEARTBEAT", flush=True)
        await asyncio.sleep(5)

app = FastAPI(title="IRAB Native Cortex", lifespan=lifespan)

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Watcher (Watching project root)
from config import PROJECT_ROOT

@app.get("/api/ai/metrics")
async def get_metrics():
    try:
        # Get memory in MB
        mem_info = process.memory_info()
        rss = mem_info.rss / 1024 / 1024
        
        # CPU usage (percent of this process)
        cpu_percent = process.cpu_percent(interval=0.1)
        
        return {
            "mem_usage_mb": round(rss, 2),
            "cpu_usage_percent": round(cpu_percent, 2),
            "status": brain.status,
            "model_path": os.path.basename(brain.llm.model_path) if brain.llm else "None"
        }
    except Exception as e:
        return {"error": str(e)}

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("New Studio client connected.")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if id(websocket) in greeted_connections:
            greeted_connections.remove(id(websocket))
        logger.info("Studio client disconnected.")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.warning(f"Failed to send personal message: {e}")
            self.disconnect(websocket)

    async def broadcast(self, message: dict):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Broadcast failed for a client: {e}")
                dead_connections.append(connection)
        for connection in dead_connections:
            self.disconnect(connection)

manager = ConnectionManager()
watcher = None # Will initialize in startup
greeted_connections = set()

# --- HISTORY HELPERS ---
LOGS_DIR = os.path.join(os.path.dirname(__file__), "data", "chat_logs")
PERSONA_PATH = os.path.join(os.path.dirname(__file__), "data", "user_persona.json")
os.makedirs(LOGS_DIR, exist_ok=True)

def load_persona():
    try:
        if os.path.exists(PERSONA_PATH):
            with open(PERSONA_PATH, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.warning(f"Failed to load persona: {e}")
    return {"coding_style": {}, "preferences": {}}

@app.get("/api/ai/persona")
async def get_persona():
    return load_persona()

@app.post("/api/ai/persona/update")
async def update_persona(data: dict):
    try:
        current = load_persona()
        current.update(data)
        with open(PERSONA_PATH, 'w') as f:
            json.dump(current, f, indent=4)
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.post("/api/history/save")
async def save_history(data: dict):
    try:
        session_id = data.get("session_id", "latest")
        # Sanitize session_id: allow only alphanumeric, underscores, and hyphens
        if not re.match(r"^[a-zA-Z0-9_\-]+$", session_id):
             return {"error": "Invalid session_id format"}
             
        filename = f"session_{session_id}.json"
        filepath = os.path.join(LOGS_DIR, filename)
        with open(filepath, "w") as f:
            json.dump(data.get("history", []), f)
        return {"success": True}
    except Exception as e:
        return {"error": str(e)}

@app.get("/api/history/load")
async def load_history(session_id: str = "latest"):
    try:
        if not re.match(r"^[a-zA-Z0-9_\-]+$", session_id):
             return {"error": "Invalid session_id format"}

        filepath = os.path.join(LOGS_DIR, f"session_{session_id}.json")
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                return json.load(f)
        return []
    except Exception as e:
        return []

@app.get("/api/history/list")
async def list_sessions():
    try:
        files = [f.replace("session_", "").replace(".json", "") for f in os.listdir(LOGS_DIR) if f.startswith("session_")]
        return sorted(files)
    except Exception as e:
        return []

@app.get("/api/ai/rag/reindex")
async def reindex_rag():
    try:
        loop = asyncio.get_event_loop()
        # Run forced ingestion in a separate thread to avoid blocking the event loop
        future = loop.run_in_executor(None, lambda: rag.ingest_project(force=True))
        future.add_done_callback(lambda f: f.exception())
        return {"success": True, "message": "Background re-indexing started."}
    except Exception as e:
        return {"error": str(e)}

async def load_brain_task():
    global watcher
    
    # 1. SET INITIAL STATE IMMEDIATELY
    brain.status = "LOADING"
    brain.loading_progress = 10
    logger.info("Brain loading task started...")

    # Start watcher/RAG in background
    loop = asyncio.get_event_loop()
    
    # Initialize watcher with the correct loop
    if watcher is None:
        watcher = IrabWatcher(PROJECT_ROOT, manager=manager, loop=loop)
    
    loop.run_in_executor(None, watcher.start)
    
    model_repo = "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF"
    model_filename = "qwen2.5-coder-3b-instruct-q4_k_m.gguf"
    model_dir = os.path.join(PROJECT_ROOT, "backend", "models")
    model_path = os.path.join(model_dir, model_filename)

    if not os.path.exists(model_path):
        logger.info(f"Model missing. Starting download from {model_repo}...")
        try:
            # Use requests for manual download to track progress for UI
            url = f"https://huggingface.co/{model_repo}/resolve/main/{model_filename}"
            
            def _dl_with_progress():
                response = requests.get(url, stream=True, timeout=10)
                response.raise_for_status()
                total_size = int(response.headers.get('content-length', 0))
                downloaded_size = 0
                
                logger.info(f"Downloading {model_filename} ({total_size / (1024*1024*1024):.2f} GB)...")
                
                with open(model_path + ".tmp", 'wb') as f:
                    for chunk in response.iter_content(chunk_size=1024 * 1024): # 1MB chunks
                        if chunk:
                            f.write(chunk)
                            downloaded_size += len(chunk)
                            percent = int((downloaded_size / total_size) * 100)
                            
                            # Update UI (throttle to every 2% to avoid flooding)
                            if percent % 2 == 0:
                                status_msg = f"Downloading 3B Model: {percent}% ({downloaded_size // (1024*1024)}MB / {total_size // (1024*1024)}MB)"
                                asyncio.run_coroutine_threadsafe(
                                    manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": percent, "status": status_msg}}),
                                    loop
                                )
                                # Also log to console
                                if percent % 10 == 0:
                                    logger.info(f"Download progress: {percent}%")
                
                os.replace(model_path + ".tmp", model_path)
                return True

            await loop.run_in_executor(None, _dl_with_progress)
            logger.info("Download complete.")
        except Exception as e:
            brain.status = "ERROR"
            logger.error(f"Download failed: {e}")
            if os.path.exists(model_path + ".tmp"):
                os.remove(model_path + ".tmp")
            await manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": 0, "status": f"Download Failed: {str(e)}"}})
            return

    if os.path.exists(model_path):
        # 2. Notify initial progress
        await manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": 85, "status": "Allocating Metal memory..."}})
        
        # 3. Load model in thread
        await loop.run_in_executor(None, brain.load_model, model_path)

        if brain.llm is None:
            # load_model already set status="ERROR" and logged the reason; don't mask it
            await manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": 0, "status": "Model load failed. Check backend logs."}})
            return

        # 4. Warmup (Trigger Metal compilation)
        await manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": 95, "status": "Firing synapses..."}})
        await loop.run_in_executor(None, brain.warmup)

        # 5. Finish
        brain.loading_progress = 100
        brain.status = "READY"
        await manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": 100, "status": "Ready"}})
    else:
        brain.status = "ERROR"
        logger.error(f"Model not found at {model_path} after download attempt.")

    # 6. Start RAG scan AFTER model is fully loaded and warmed up to avoid OOM
    async def initial_rag_scan():
        await asyncio.sleep(10)  # Extra buffer after model warmup
        logger.info("Starting initial RAG codebase scan...")
        try:
            await loop.run_in_executor(None, rag.ingest_project)
            logger.info("RAG codebase scan complete.")
        except Exception as e:
            logger.error(f"RAG ingestion failed (non-fatal): {e}")

    asyncio.create_task(initial_rag_scan())
@app.get("/api/ai/status")
async def get_status():
    return {
        "status": brain.status,
        "progress": brain.loading_progress,
        "model_loaded": brain.llm is not None
    }

@app.post("/api/ai/chat")
async def chat_fallback(data: dict):
    try:
        message = data.get("message", "")
        if not message:
            return {"error": "Empty message"}
        
        logger.info(f"Fallback chat request: {message[:50]}...")
        
        # Determine engine context if provided
        context = data.get("context", {})
        
        # Use brain to generate response (non-streaming)
        # We wrap it in a list to get the full response from the generator
        full_response = ""
        for token in brain.generate_stream(message):
            if token:
                full_response += token
        
        return {"response": full_response}
    except Exception as e:
        logger.error(f"Fallback chat error: {e}")
        return {"error": str(e)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Immediate Status Report
        await manager.send_personal_message({
            "type": "LOAD_PROGRESS",
            "data": {"percent": brain.loading_progress, "status": brain.status}
        }, websocket)

        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await manager.send_personal_message({
                    "type": "ERROR",
                    "data": "Invalid JSON payload"
                }, websocket)
                continue
            logger.info(f"Received event: {message.get('type')}")
            
            msg_type = message.get("type")
            
            if msg_type == "PROMPT" or msg_type == "CHAT":
                await handle_prompt(message, websocket)
            elif msg_type == "ABORT":
                logger.info("Received ABORT request.")
                brain.abort()
            elif msg_type == "PING":
                await manager.send_personal_message({"type": "PONG"}, websocket)
            elif msg_type == "CHECK_STATUS":
                await manager.send_personal_message({
                    "type": "LOAD_PROGRESS",
                    "data": {"percent": brain.loading_progress, "status": brain.status}
                }, websocket)
                
                # If brain is already READY, send a greeting if not sent yet for this connection
                ws_id = id(websocket)
                if brain.status == "READY" and ws_id not in greeted_connections:
                    logger.info(f"Sending funny greeting to connection {ws_id}")
                    greeted_connections.add(ws_id)
                    import random
                    isms = ["GRRR... I AM AWAKE!", "GRRR... READY TO PIXELATE!", "GRRR... SYSTEM ONLINE AND HUNGRY!", "GRRR... NEED HELP OR JUST A SNACK?"]
                    await manager.send_personal_message({"type": "SYSTEM_GREETING", "data": random.choice(isms)}, websocket)
                    await manager.send_personal_message({"type": "SET_STATE", "data": "IDLE"}, websocket)
            elif msg_type == "UPDATE_CONFIG":
                config = message.get("data", {})
                logger.info(f"Updating configuration: {config}")
                brain.update_config(config)
                await manager.send_personal_message({
                    "type": "TOKEN",
                    "data": "\n[System] Brain reconfigured successfully."
                }, websocket)
            elif msg_type == "SYNC_TOOLS":
                tools = message.get("data", [])
                logger.info(f"Syncing {len(tools)} tools from Studio.")
                if hasattr(brain, 'update_tools'):
                    brain.update_tools(tools)
                else:
                    logger.warning("Brain does not support update_tools yet.")

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
async def handle_prompt(message, websocket):
    msg_id = message.get("id")
    request_type = message.get("type", "PROMPT")
    data = message.get("data", "")

    # If data is an object (from CHAT event), extract message and context
    prompt = data
    context_data = {}
    if isinstance(data, dict):
        prompt = data.get("message", "")
        context_data = data.get("context", {})
    else:
        context_data = message.get("context", {})

    is_ghost = "Ghost Text autocomplete" in prompt

    logger.info(f"Handling prompt (ID: {msg_id}, Ghost: {is_ghost}): {prompt[:50]}...")

    if not is_ghost:
        await manager.send_personal_message({"type": "SET_STATE", "data": "THINKING"}, websocket)

    # Deterministic intent routing for iso map requests:

    # Using pixel.generateTerrain directly allows ToolRegistry redirect/pending recovery
    # and avoids workflow interruption during full-page navigation.
    prompt_lower = prompt.lower()
    iso_map_triggers = (
        "isometric map",
        "isopixel map",
        "iso map",
        "iso world",
        "isometric terrain",
        "isopixel terrain",
    )
    if request_type != "CHAT" and not is_ghost and any(trigger in prompt_lower for trigger in iso_map_triggers):
        await manager.send_personal_message({
            "type": "TOKEN",
            "data": "GRRR... Initiating IsoPixel terrain generation sequence."
        }, websocket)
        await manager.send_personal_message({
            "type": "COMMAND",
            "data": {
                "action": "pixel.generateTerrain",
                "params": {"mode": "islands", "scale": 0.05, "amplitude": 10}
            }
        }, websocket)
        await manager.send_personal_message({"type": "TOKEN", "data": None}, websocket)
        await manager.send_personal_message({"type": "SET_STATE", "data": "IDLE"}, websocket)
        return
    
    # Incorporate Phase 2: Active Focus
    focused_code = context_data.get("focused_code", "")
    
    max_tokens = context_data.get("max_tokens", brain.max_tokens)
    temperature = context_data.get("temperature", 0.1)
    
    # Only use RAG for code-related questions
    context = ""
    if not is_ghost:
        code_keywords = {'code', 'function', 'bug', 'error', 'fix', 'script', 'file', 'editor', 
                         'sprite', 'npc', 'logic', 'quest', 'dialogue', 'level', 'map', 'engine',
                         'kod', 'hata', 'dosya', 'düzelt', 'nasıl'}
        
        if any(kw in prompt.lower() for kw in code_keywords):
            try:
                logger.info("Querying RAG system...")
                loop = asyncio.get_event_loop()
                # Retrieve top 2 most relevant chunks
                context = await loop.run_in_executor(None, lambda: rag.query(prompt, n_results=2))
                logger.info(f"RAG context retrieved ({len(context)} chars).")
                # Limit to 1500 chars to stay within the 2048 context window safely
                if len(context) > 1500:
                    context = context[:1500] + "..."
            except Exception as e:
                logger.error(f"RAG query failed: {e}")
                context = ""
    
    # Incorporate Phase 7: User Persona
    persona = load_persona()
    style_guidance = f"\nUser Coding Style: {json.dumps(persona.get('coding_style', {}))}"
    
    project_context = str(context_data.get("projectContext", ""))[:6000]
    browser_rag_context = str(context_data.get("ragContext", ""))[:2500]
    automation_protocol = str(context_data.get("automationProtocol", ""))[:1000]
    tool_schemas = str(context_data.get("tools", ""))[:6000]
    browser_context = ""
    if not is_ghost:
        if automation_protocol:
            browser_context += f"\n[AUTOMATION CONTRACT]\n{automation_protocol}\n"
        if tool_schemas:
            browser_context += f"\n[TOOL SCHEMAS]\n{tool_schemas}\n"
        if project_context:
            browser_context += f"\n[ACTIVE PROJECT CONTEXT]\n{project_context}\n"
        if browser_rag_context:
            browser_context += f"\n[ENGINE DOCUMENTATION]\n{browser_rag_context}\n"

    if focused_code and not is_ghost:
        if len(focused_code) > 500: focused_code = focused_code[:500] + "..."
        augmented_prompt = f"{browser_context}\nCode:\n{focused_code}\n\n{style_guidance}\n\nQuestion: {prompt}"
    elif context:
        augmented_prompt = f"{browser_context}\nReference:\n{context}\n\n{style_guidance}\n\nQuestion: {prompt}"
    else:
        augmented_prompt = f"{browser_context}\n{style_guidance}\n\n{prompt}"
    
    logger.info(f"Augmented prompt length: {len(augmented_prompt)} chars")
    full_response = ""
    
    # Phrases the 3B model tends to regurgitate
    PROMPT_LEAK_PHRASES = [
        'Available tools:', 'To open a tool:', 'To show emotion:', 
        'Do NOT repeat', 'COMMANDS:', 'RULES:', '--- FILE:', 
        'Reference:', 'TOOLNAME', 'Do not repeat these'
    ]
    
    try:
        logger.info("Starting token generation...")
        
        in_tool_block = False
        tool_buffer = ""

        # Generation Loop - Use brain.generate_stream to get proper chat template wrapping
        # We pass context options to brain if needed
        brain.update_config({"max_tokens": max_tokens, "temperature": temperature})
        
        # Define stop sequences
        stop_sequences = ["<|im_end|>", "<|im_start|>", "User:"]
        if is_ghost:
            stop_sequences.append("\n\n")

        for token in brain.generate_stream(augmented_prompt, stop=stop_sequences):
            if brain.is_aborted: break
            if not token: continue
            
            # --- KAP Protocol Detection ---
            if not in_tool_block:
                potential_full = full_response + token
                if "```" in potential_full and not is_ghost:
                    marker_pos = potential_full.rfind("```")
                    split_idx = marker_pos - len(full_response)
                    if split_idx > 0:
                        await manager.send_personal_message({"type": "TOKEN", "data": token[:split_idx]}, websocket)
                    in_tool_block = True
                    tool_buffer = potential_full[marker_pos:]
                    full_response = potential_full
                    continue
                else:
                    if not is_ghost and any(phrase in (full_response + token)[-100:] for phrase in PROMPT_LEAK_PHRASES):
                        full_response += token
                        continue
                    
                    full_response += token
                    await manager.send_personal_message({"type": "TOKEN", "data": token}, websocket)
            else:
                full_response += token
                tool_buffer += token
                if tool_buffer.count("```") >= 2: 
                    try:
                        start = tool_buffer.find('{')
                        end = tool_buffer.rfind('}')
                        if start != -1 and end != -1:
                            json_str = tool_buffer[start:end+1]
                            call = json.loads(json_str)
                            # CHAT requests are coordinated by the browser KAP runtime,
                            # which validates, previews, approves, and correlates results.
                            # COMMAND remains only for legacy PROMPT clients.
                            if request_type != "CHAT":
                                await manager.send_personal_message({
                                    "type": "COMMAND",
                                    "data": {"action": call.get("name"), "params": call.get("args", {})}
                                }, websocket)
                    except Exception as e: logger.error(f"KAP Error: {e}")
                    in_tool_block = False
                    tool_buffer = ""
                    continue
            await asyncio.sleep(0)
            
    except Exception as e:
        logger.error(f"Generation error: {e}")
        await manager.send_personal_message({"type": "TOKEN", "data": f"Error: {str(e)}"}, websocket)
    
    await manager.send_personal_message({"type": "TOKEN", "data": None}, websocket)
    
    # If msg_id exists, send a final consolidated response to resolve the frontend's promise
    if msg_id:
        await manager.send_personal_message({
            "type": "CHAT_RESPONSE",
            "id": msg_id,
            "data": {"text": full_response}
        }, websocket)

    if not is_ghost:
        await manager.send_personal_message({"type": "SET_STATE", "data": "IDLE"}, websocket)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info", access_log=False)
