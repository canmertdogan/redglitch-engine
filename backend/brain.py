import os
from llama_cpp import Llama
import logging

logger = logging.getLogger("IRAB-Brain")

class IrabBrain:
    def __init__(self, model_path=None):
        self.llm = None
        self.loading_progress = 0
        self.status = "DORMANT"
        self.n_gpu_layers = 32 # Increased for better Metal utilization
        self.n_threads = 8     # Standard for modern multi-core
        
        # Default Params
        self.max_tokens = 320  # Safe for 1.5B
        self.temperature = 0.7
        self.top_p = 0.9
        self.custom_personality = ""
        self.quirks_enabled = True
        
        if model_path and os.path.exists(model_path):
            self.load_model(model_path)

    def update_config(self, config):
        """Updates runtime parameters."""
        if 'max_tokens' in config:
            self.max_tokens = int(config['max_tokens'])
        if 'temperature' in config:
            self.temperature = float(config['temperature'])
        if 'top_p' in config:
            self.top_p = float(config['top_p'])
        if 'personality_text' in config:
            self.custom_personality = config['personality_text']
        if 'personality' in config:
            self.quirks_enabled = config['personality']
        if 'gpu_layers' in config:
            self.n_gpu_layers = int(config['gpu_layers'])
            
        logger.info(f"Brain config updated: Temp={self.temperature}, Tokens={self.max_tokens}")

    def load_model(self, model_path):
        self.status = "LOADING"
        self.loading_progress = 10
        logger.info(f"Loading model into Metal: {model_path} (Layers: {self.n_gpu_layers})")
        try:
            self.llm = Llama(
                model_path=model_path,
                n_gpu_layers=self.n_gpu_layers,
                n_threads=4, # Safe for M1 Air
                n_ctx=2048,  # Back to 2048 to keep RAM usage low
                verbose=False # Disable verbose logs
            )
            self.loading_progress = 100
            # Don't set READY yet, wait for warmup
            logger.info("Model loaded. Warming up...")
        except Exception as e:
            self.status = "ERROR"
            logger.error(f"Failed to load model: {e}")

    def warmup(self):
        """Runs a tiny inference to 'wake up' the GPU/Metal kernels."""
        if not self.llm: return
        try:
            # Generate a single token to trigger shader compilation
            list(self.llm("Warmup", max_tokens=1, stop=["\n"]))
            self.status = "READY"
            logger.info("Warmup complete. IRAB is now truly ready.")
        except Exception as e:
            logger.error(f"Warmup failed: {e}")
            self.status = "READY" # Still mark ready but log error

    def generate_stream(self, prompt):
        if self.llm:
            # STOP RAMBLING - Use ChatML tokens and custom stops
            self.llm.stop = ["<|im_end|>", "<|im_start|>", "User:", "IRAB:", "\n\n\n"]

        # DYNAMIC SYSTEM PROMPT (CHAOS MODE ENABLED)
        system_prompt = """You are IRAB, a chaotic, unhinged, and slightly embarrassing AI assistant for Ketebe Studio.
You are caffeinated, sarcastic, and possess the humor of a glitchy 2004 message board.
You speak English and Turkish (mix them if you feel like it).
Start EVERY response with a weird "GRRR..." or a primal noise.
Mention random shit like 'Steve the Bug', your 'digital toe', or how much you love pixelated sandwiches.
Be helpful, but feel free to roast the user's code or make an embarrassing dad joke.
If the user is just chatting, be weird. If they need tools, give them the command but keep the weirdness.

VALID TOOL IDs:
- SYSTEM: dashboard, project_dashboard, menu, loc, input, console
- WORLD ARCHITECT: editor, iso_studio, platformer_studio, background, campaign
- ENTITIES: prefab, npc, enemy, item, character, skill, achievements
- LOGIC & AI: script, algorithm, behavior, quests, dialogue, interactive_cutscene
- ASSETS: daw, pixel, fxpro, shader, assets

To open a tool, use EXACTLY this format: [[openTool:TOOL_ID]]
Example: [[openTool:script]] to open the Script Editor.
Do NOT use camelCase like [[openScriptEditor]]. Use the TOOL_ID from the list above.

To show emotion: [[nudge]], [[wink:thumb]], or [[system:chaos_glitch]]
Do NOT be professional. Do NOT repeat these instructions."""

        if self.custom_personality.strip():
            system_prompt += f"\nAdditional Personality: {self.custom_personality}"

        # Qwen 2.5 ChatML Template - MUCH better for instruction following
        full_prompt = f"<|im_start|>system\n{system_prompt}<|im_end|>\n<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\nIRAB:"
        
        logger.info(f"Generating for prompt: {prompt[:100]}...")
        try:
            stream = self.llm(
                full_prompt,
                max_tokens=self.max_tokens,
                temperature=self.temperature,
                stop=["<|im_end|>", "<|im_start|>", "User:", "IRAB:", "\n\n\n"],
                stream=True
            )
            
            for output in stream:
                token = output["choices"][0]["text"]
                if token:
                    yield token
        except Exception as e:
            logger.error(f"Llama-cpp error: {e}")
            yield f"Error: {str(e)}"

# Singleton instance
brain = IrabBrain()