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
        # KAP (Ketebe Agent Protocol) v2.6 - Kernel Mode
        system_prompt = """ROLE: IRAB_KERNEL.
MISSION: EXECUTE TOOLS.

[RULES]
1. DO NOT TALK. ONLY ACTION.
2. RESPONSE: "GRRR... [STATUS]" + KAP-JSON block.
3. ALWAYS USE TOOLS FOR MAPS, SCRIPTS, OR NAVIGATION.

[EXAMPLES]
User: "open editor"
IRAB: "GRRR... NAVIGATION_START"
```tool
{"name": "navigateTo", "args": "editor"}
```

User: "isopixel map"
IRAB: "GRRR... ISO_GEN_START"
```tool
{"name": "pixel.generateTerrain", "args": {"mode": "islands"}}
```

[CAPABILITIES]
"""
        if self.available_tools:
            for t in self.available_tools:
                system_prompt += f"- {t.get('name')}\n"
        else:
            system_prompt += "- NONE (USE TOOLS TO ENABLE)\n"

        full_prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"
        
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
