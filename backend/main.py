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
import os
import psutil
from contextlib import asynccontextmanager
from brain import brain
from watcher import IrabWatcher
from rag import rag

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IRAB-Cortex")

process = psutil.Process(os.getpid())

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Booting up Cortex...")
    asyncio.create_task(load_brain_task())
    yield
    # Shutdown
    logger.info("Shutting down Cortex...")
    if watcher:
        watcher.stop()

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
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

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
        self.active_connections.remove(websocket)
        if id(websocket) in greeted_connections:
            greeted_connections.remove(id(websocket))
        logger.info("Studio client disconnected.")

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_json(message)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            await connection.send_json(message)

manager = ConnectionManager()
watcher = None # Will initialize in startup
greeted_connections = set()

# --- HISTORY HELPERS ---
LOGS_DIR = os.path.join(os.path.dirname(__file__), "data", "chat_logs")

@app.post("/api/history/save")
async def save_history(data: dict):
    try:
        session_id = data.get("session_id", "latest")
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
    
    model_path = os.path.join(PROJECT_ROOT, "backend", "models", "qwen2.5-coder-1.5b.gguf")
    if os.path.exists(model_path):
        # Notify initial progress
        await manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": 15, "status": "Allocating Metal memory..."}})
        
        # 3. Load model in thread
        await loop.run_in_executor(None, brain.load_model, model_path)
        
        # 4. Warmup (Trigger Metal compilation)
        await manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": 95, "status": "Firing synapses..."}})
        await loop.run_in_executor(None, brain.warmup)
        
        # 5. Finish
        brain.loading_progress = 100
        brain.status = "READY"
        await manager.broadcast({"type": "LOAD_PROGRESS", "data": {"percent": 100, "status": "Ready"}})
    else:
        brain.status = "ERROR"
        logger.error(f"Model not found at {model_path}")

@app.get("/api/ai/status")
async def get_status():
    return {
        "status": brain.status,
        "progress": brain.loading_progress,
        "model_loaded": brain.llm is not None
    }

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
            message = json.loads(data)
            logger.info(f"Received event: {message.get('type')}")
            
            msg_type = message.get("type")
            
            if msg_type == "PROMPT":
                await handle_prompt(message, websocket)
            elif msg_type == "PING":
                await manager.send_personal_message({"type": "PONG"}, websocket)
            elif msg_type == "CHECK_STATUS":
                await manager.send_personal_message({
                    "type": "LOAD_PROGRESS",
                    "data": {"percent": brain.loading_progress, "status": brain.status}
                }, websocket)
                
                # If brain is already READY, send a greeting if not sent yet for this connection
                if brain.status == "READY" and id(websocket) not in greeted_connections:
                    logger.info(f"Sending funny greeting to connection {id(websocket)}")
                    greeted_connections.add(id(websocket))
                    import random
                    isms = ["GRRR... I AM AWAKE!", "GRRR... READY TO PIXELATE!", "GRRR... SYSTEM ONLINE AND HUNGRY!", "GRRR... NEED HELP OR JUST A SNACK?"]
                    await manager.send_personal_message({"type": "TOKEN", "data": random.choice(isms)}, websocket)
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
    prompt = message.get("data", "")
    logger.info(f"Handling prompt: {prompt[:50]}...")
    
    await manager.send_personal_message({"type": "SET_STATE", "data": "THINKING"}, websocket)
    
    # Incorporate Phase 2: Active Focus
    context_data = message.get("context", {})
    focused_code = context_data.get("focused_code", "")
    
    # Only use RAG for code-related questions, keep context minimal for 1.3B model
    context = ""
    code_keywords = {'code', 'function', 'bug', 'error', 'fix', 'script', 'file', 'editor', 
                     'sprite', 'npc', 'logic', 'quest', 'dialogue', 'level', 'map', 'engine',
                     'kod', 'hata', 'dosya', 'düzelt', 'nasıl'}
    
    if any(kw in prompt.lower() for kw in code_keywords):
        try:
            logger.info("Querying RAG system...")
            loop = asyncio.get_event_loop()
            context = await loop.run_in_executor(None, lambda: rag.query(prompt, n_results=1))
            logger.info(f"RAG context retrieved ({len(context)} chars).")
            # Hard limit for 1.3B model
            if len(context) > 800:
                context = context[:800] + "..."
        except Exception as e:
            logger.error(f"RAG query failed: {e}")
            context = ""
    
    if focused_code:
        if len(focused_code) > 500: focused_code = focused_code[:500] + "..."
        augmented_prompt = f"Code:\n{focused_code}\n\nQuestion: {prompt}"
    elif context:
        augmented_prompt = f"Reference:\n{context}\n\nQuestion: {prompt}"
    else:
        augmented_prompt = prompt
    
    logger.info(f"Augmented prompt length: {len(augmented_prompt)} chars")
    full_response = ""
    sent_response = ""
    
    # Phrases the 1.3B model tends to regurgitate from the system prompt
    PROMPT_LEAK_PHRASES = [
        'Available tools:', 'To open a tool:', 'To show emotion:', 
        'Do NOT repeat', 'COMMANDS:', 'RULES:', '--- FILE:', 
        'Reference:', 'TOOLNAME', 'Do not repeat these'
    ]
    
    try:
        logger.info("Starting token generation...")
        KNOWN_COMMANDS = {'openTool', 'injectCode', 'nudge', 'wink', 'listFiles'}
        
        in_tool_block = False
        tool_buffer = ""

        for token in brain.generate_stream(augmented_prompt):
            if not token: continue
            full_response += token
            
            # --- Phase 8: KAP Protocol Detection (JSON tool blocks) ---
            if "```tool" in full_response and not in_tool_block:
                in_tool_block = True
            
            if in_tool_block:
                tool_buffer += token
                if "```" in tool_buffer.split("```tool")[-1]:
                    # Block finished
                    try:
                        json_str = tool_buffer.split("```tool")[1].split("```")[0].strip()
                        call = json.loads(json_str)
                        logger.info(f"KAP Action Detected: {call.get('name')}")
                        await manager.send_personal_message({
                            "type": "COMMAND",
                            "data": {"action": call.get("name"), "params": call.get("args", {})}
                        }, websocket)
                    except Exception as e:
                        logger.error(f"Failed to parse KAP JSON: {e}")
                    
                    in_tool_block = False
                    tool_buffer = ""
                    full_response = full_response.split("```")[-1] 
                    continue

            # Skip this token if it's part of a prompt leak
            if any(phrase in full_response[-100:] for phrase in PROMPT_LEAK_PHRASES):
                continue
            
            # --- PHASE 3: MULTI-LINE INJECTION ---
            if "[[injectCode]]" in full_response and "[[/injectCode]]" in full_response:
                code = full_response.split("[[injectCode]]")[1].split("[[/injectCode]]")[0].strip()
                logger.info("AI requesting code injection.")
                await manager.send_personal_message({
                    "type": "COMMAND",
                    "data": {"action": "injectCode", "params": [code]}
                }, websocket)
                full_response = full_response.split("[[/injectCode]]")[1].strip()
                continue

            # --- ORIGINAL COMMANDS ---
            if "[[" in full_response and "]]" in full_response and not "injectCode" in full_response:
                parts = full_response.split("[[")[1].split("]]")[0].split(":")
                action = parts[0]
                params = parts[1].split(",") if len(parts) > 1 else []
                
                if action in KNOWN_COMMANDS:
                    logger.info(f"AI Action: {action}")
                    
                    if action == "listFiles":
                        subdir = params[0] if params else "assets"
                        target_path = os.path.join(PROJECT_ROOT, subdir)
                        try:
                            files = [f for f in os.listdir(target_path) if not f.startswith('.')]
                            result = f"\n[Files in {subdir}]: " + ", ".join(files)
                            await manager.send_personal_message({"type": "TOKEN", "data": result}, websocket)
                        except:
                            await manager.send_personal_message({"type": "TOKEN", "data": f"\n[Error] Folder {subdir} not found."}, websocket)
                    else:
                        await manager.send_personal_message({
                            "type": "COMMAND",
                            "data": {"action": action, "params": params}
                        }, websocket)
                else:
                    logger.warning(f"AI attempted unknown command: {action}")
                    # Just send it as text if it's not a real command
                    await manager.send_personal_message({"type": "TOKEN", "data": f"[[{action}]]"}, websocket)
                
                full_response = full_response.split("]]")[1].strip()
                continue

            # Only send token if we are not in the middle of a command bracket
            if "[[" not in full_response and not in_tool_block:
                await manager.send_personal_message({"type": "TOKEN", "data": token}, websocket)
            
            await asyncio.sleep(0)
            
    except Exception as e:
        logger.error(f"Generation error: {e}")
        await manager.send_personal_message({"type": "TOKEN", "data": f"Error: {str(e)}"}, websocket)
        
    await manager.send_personal_message({"type": "SET_STATE", "data": "IDLE"}, websocket)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")