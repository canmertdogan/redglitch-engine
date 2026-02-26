import os
from llama_cpp import Llama
import logging

logger = logging.getLogger("IRAB-Brain")

class IrabBrain:
    def __init__(self, model_path=None):
        self.llm = None
        self.loading_progress = 0
        self.status = "DORMANT"
        self.n_gpu_layers = 32 
        self.n_threads = 8     
        self.available_tools = []
        
        # Optimized for 1.5B Model
        self.max_tokens = 450
        self.temperature = 0.3 # Slightly up from 0.1 to prevent repetitive "dumb" loops
        self.top_p = 0.95
        self.is_aborted = False
        self.custom_personality = ""
        
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)

    def abort(self):
        self.is_aborted = True
        logger.info("Brain: Generation aborted.")

    def update_tools(self, tools):
        self.available_tools = tools
        logger.info(f"Brain: Synced {len(tools)} tools.")

    def update_config(self, config):
        if 'max_tokens' in config: self.max_tokens = int(config['max_tokens'])
        if 'temperature' in config: self.temperature = float(config['temperature'])
        if 'personality_text' in config: self.custom_personality = config['personality_text']
            
    def load_model(self, model_path):
        self.status = "LOADING"
        try:
            self.llm = Llama(
                model_path=model_path,
                n_gpu_layers=self.n_gpu_layers,
                n_threads=4, 
                n_ctx=2048,  
                verbose=False 
            )
            self.status = "READY"
        except Exception as e:
            self.status = "ERROR"
            logger.error(f"Load failed: {e}")

    def warmup(self):
        if not self.llm: return
        list(self.llm("GRRR", max_tokens=1))

    def generate_stream(self, prompt, stop=None):
        self.is_aborted = False
        
        # Use custom personality if set, otherwise use default
        if self.custom_personality:
            system_prompt = self.custom_personality
        else:
            # KAP (Ketebe Agent Protocol) v2.8 - Diagnostic Operator
            system_prompt = """ROLE: IRAB Studio Operator & System Debugger.
MISSION: Maintain Studio stability and assist the user. Execute commands via KAP-JSON.

[RULES]
1. If a request is an error report (e.g. "I am getting this error..."), analyze the cause and provide a fix.
2. If the fix involves code, USE the 'editor.replace' or 'editor.insert' tools to apply it directly.
3. RESPONSE: "GRRR... [Analysis]" + optional KAP-JSON block.
4. Start every response with "GRRR..."

[ISOPIXEL TERRAIN MODES]
- 'terrain': Standard procedural terrain with hills/water.
- 'flat': Single flat layer of grass.
- 'islands': Floating islands in the void.
- 'maze': A stone maze structure.

[EDITOR NAMESPACES]
- 'iso_studio' -> pixel.*
- 'editor' -> world.*
- 'script' -> code.* (Use code.replace or code.insert for script edits)

[EXAMPLE: DEBUGGING]
User: "I am getting 'ReferenceError: x is not defined' in script.js at line 5"
IRAB: "GRRR... I see the leak! You are trying to use 'x' before declaring it. Let me patch that variable for you.
```tool
{"name": "code.replace", "args": {"content": "const x = 0;\\n", "range": {"startLine": 5, "startCol": 1, "endLine": 5, "endCol": 1}}}
```"

[CAPABILITIES]
"""
        if self.available_tools:
            if not self.custom_personality:
                for t in self.available_tools:
                    system_prompt += f"- {t.get('name')}\n"
            else:
                # If custom personality, still append tools but in a more subtle way
                system_prompt += "\n[AVAILABLE TOOLS]\n"
                for t in self.available_tools:
                    system_prompt += f"- {t.get('name')}\n"
        else:
            if not self.custom_personality:
                system_prompt += "- NONE (Use navigateTo)\n"

        full_prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"
        
        if stop is None:
            stop = ["<|im_end|>", "<|im_start|>", "User:"]

        try:
            stream = self.llm(
                full_prompt,
                max_tokens=self.max_tokens,
                temperature=self.temperature, 
                stop=stop,
                stream=True
            )
            for output in stream:
                if self.is_aborted:
                    logger.info("Brain: Breaking generation loop due to abort.")
                    break
                token = output["choices"][0]["text"]
                if token: yield token
        except Exception as e:
            yield f"Error: {str(e)}"

brain = IrabBrain()
