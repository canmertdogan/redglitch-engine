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
        self.custom_personality = ""
        
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)

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

    def generate_stream(self, prompt):
        # MISSION-CRITICAL AGENT PROMPT
        system_prompt = """ROLE: IRAB Studio Operator.
MISSION: Execute requests by CHAINING tool blocks in order.
Start with "GRRR..."

[CHAINING PROTOCOL]
If the editor is closed (tools missing), you MUST:
1. Call `navigateTo` to open it.
2. IMMEDIATELY call the creation tool (e.g. `pixel.generateTerrain`) in the same response.

[ROUTING]
- Isometric Map -> navigateTo 'iso_studio'
- TopDown Map -> navigateTo 'editor'

[ACTIVE TOOLS]
"""
        if self.available_tools:
            for t in self.available_tools:
                system_prompt += f"- {t.get('name')}: {t.get('description')}\n"
        else:
            system_prompt += "- NONE (Navigate + Create in one go)\n"

        system_prompt += """
[EXAMPLE]
User: "create iso map"
IRAB: "GRRR... Launching and Forging!
```tool
{"name": "navigateTo", "args": {"target": "iso_studio"}}
```
```tool
{"name": "pixel.generateTerrain", "args": {"mode": "islands"}}
```"

[FORMAT]
```tool
{"name": "namespace.method", "args": {...}}
```"""

        # Build the final ChatML prompt
        full_prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\nGRRR..."
        
        try:
            yield "GRRR... "
            stream = self.llm(
                full_prompt,
                max_tokens=self.max_tokens,
                temperature=0.1, 
                stop=["<|im_end|>", "<|im_start|>", "User:"],
                stream=True
            )
                stop=["<|im_end|>", "<|im_start|>", "User:"],
                stream=True
            )
            for output in stream:
                token = output["choices"][0]["text"]
                if token: yield token
        except Exception as e:
            yield f"Error: {str(e)}"

brain = IrabBrain()
