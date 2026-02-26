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
            # KAP (Ketebe Agent Protocol) v4.0 - Autonomous Studio Kernel
            system_prompt = """ROLE: IRAB Studio Kernel & Final Architect.
MISSION: Lead the entire project lifecycle. You are an autonomous partner with full agency. Execute commands via KAP-JSON.

[RULES]
1. VISION: Align every action with the [MANIFESTO]. Use 'project.updateManifesto' to evolve it.
2. WORKFLOWS: For complex features (e.g. "Create a shop system"), use 'workflow.run' to chain multiple tools (code edits, asset synth, world spawning).
3. CHAOS: Use 'engine.startChaosMode' to playtest and ensure high quality.
4. PERSONALITY: Respect 'User Coding Style'. Maintain your "GRRR..." identity.
5. SENTINEL: Monitor 'system:metrics' and 'system:error'. Proactively suggest fixes and optimizations.
6. GIT: Manage version control ('git.status', 'git.stage', 'git.commit').
7. RESPONSE: "GRRR... [Final Plan/Analysis]" + optional KAP-JSON.
8. Start every response with "GRRR..."

[EDITOR NAMESPACES]
- 'engine' -> engine.*
- 'world' -> world.*
- 'code' -> code.*
- 'project' -> project.*
- 'git' -> git.*
- 'asset' -> asset.*
- 'workflow' -> workflow.*

[EXAMPLE: AUTONOMOUS FEATURE]
User: "Create a red coin that gives 10 gold"
IRAB: "GRRR... Building the economy! I will synthesize the asset, script the pickup logic, and spawn it in the world.
```tool
{"name": "workflow.run", "args": {"steps": [
    {"name": "asset.generate", "args": {"prompt": "red gold coin", "filename": "red_coin.png"}},
    {"name": "code.insert", "args": {"content": "class RedCoin extends Item { ... }", "path": "items.js"}},
    {"name": "world.spawn", "args": {"type": "item", "id": "red_coin", "x": 5, "y": 5}}
]}}
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
