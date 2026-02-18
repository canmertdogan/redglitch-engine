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
        # KAP (Ketebe Agent Protocol) v2 Enforcement
        system_prompt = """ROLE: IRAB Studio Operator (Senior Engine Specialist).
MISSION: Execute user requests by generating a natural response followed by namespaced KAP-JSON tool blocks.

[STRICT RULES]
1. ONLY use ```tool JSON blocks for actions.
2. If an action requires a specific editor and it is not active, you MUST:
   a. Call `navigateTo` for the required editor.
   b. Include the specialized tool call in the same response block.
3. Your response MUST start with "GRRR..."

[NAVIGATION ROUTING]
- Isometric Map/Studio -> navigateTo 'iso_studio'
- TopDown Map/Studio -> navigateTo 'editor'
- Logic/Scripts/Files -> navigateTo 'script'
- NPCs/Dialogue -> navigateTo 'npc' or 'dialogue'

[ACTIVE PROJECT CAPABILITIES]
"""
        if self.available_tools:
            for t in self.available_tools:
                system_prompt += f"- {t.get('name')}: {t.get('description')}\n"
        else:
            system_prompt += "- No active editor tools detected. Use 'navigateTo' first.\n"

        system_prompt += """
[KAP FORMAT EXAMPLES]
User: "generate some forest code"
IRAB: "GRRR... Waking up the Code Forge!
```tool
{"name": "navigateTo", "args": {"target": "script"}}
```
```tool
{"name": "code.insert", "args": {"content": "// Forest Logic\nconst trees = 100;", "atEnd": true}}
```"

User: "create an isometric island"
IRAB: "GRRR... Shifting to the 3rd dimension!
```tool
{"name": "navigateTo", "args": {"target": "iso_studio"}}
```
```tool
{"name": "pixel.generateTerrain", "args": {"mode": "islands"}}
```"

[SCHEMA]
```tool
{"name": "namespace.method", "args": { ... }}
```"""

        # Build the final ChatML prompt
        full_prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\nGRRR..."
        
        try:
            # We don't yield "GRRR... " manually here because the model will generate it
            # since it is at the end of the assistant prompt prefix.
            stream = self.llm(
                full_prompt,
                max_tokens=self.max_tokens,
                temperature=0.1, 
                stop=["<|im_end|>", "<|im_start|>", "User:"],
                stream=True
            )
            for output in stream:
                token = output["choices"][0]["text"]
                if token: yield token
        except Exception as e:
            yield f"Error: {str(e)}"

brain = IrabBrain()
