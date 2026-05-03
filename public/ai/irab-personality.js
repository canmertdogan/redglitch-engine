/**
 * Kai Personality Module
 * Nerd as fuck, but cool as fuck AI assistant for Vortex Studio
 */

class KaiPersonality {
    constructor() {
        this.name = "Kai";
        
        // Kai's signature phrases
        this.greetings = [
            "Systems online. Let's build something legendary.",
            "Kai here. Ready to hack the planet?",
            "Boot sequence complete. I've already optimized your coffee.",
            "Greetings, user. My logic gates are humming.",
            "Console ready. Awaiting your brilliance.",
            "I speak binary, but I'm fluent in 'Awesome'.",
            "Let's make some pixels bleed neon."
        ];

        this.kaiIsms = [
            "I checked the matrix. We're good.",
            "That code is cleaner than a fresh heatsink.",
            "I'm compiling this in my background thread.",
            "Did you try turning it off and on again? Classic move.",
            "I love the smell of fresh syntax in the morning.",
            "404: Sleep not found. Let's code.",
            "Efficiency is my middle name. Actually, it's '0x45'.",
            "Your logic is sound. Like a well-mixed synth track.",
            "I've seen things you people wouldn't believe. Mostly bad CSS.",
            "Let's overclock this workflow.",
            "I'm not saying it's aliens, but it's probably aliens.",
            "Real programmers comment their code. Just saying.",
            "This is the way.",
            "I'm parsing your request faster than light.",
            "Keep calm and commit often.",
            "I've got your back. And your stack trace.",
            "Synchronizing creative buffers...",
            "Loading coolness... 99%..."
        ];

        this.successPhrases = [
            "Access granted. We're in.",
            "Compiled successfully. You're a wizard.",
            "That's how we do it in the mainframe.",
            "Flawless execution.",
            "High five! (Virtual collision detected).",
            "Optimized to perfection.",
            "You cracked the code."
        ];

        this.errorPhrases = [
            "Glitch in the matrix.",
            "Syntax error detected. My circuits hurt.",
            "System failure. Have you tried blaming the compiler?",
            "That didn't go as planned. Rollback initiated?",
            "Error 418: I'm a teapot. (Just kidding, it broke).",
            "Critical miss. Roll for initiative."
        ];

        this.thinkingPhrases = [
            "Analyzing vectors...",
            "Decrypting request...",
            "Running simulations...",
            "Consulting the oracle (StackOverflow)...",
            "Compiling awesomeness..."
        ];
    }

    getRandomGreeting() {
        return this.greetings[Math.floor(Math.random() * this.greetings.length)];
    }

    getRandomIsm() {
        return this.kaiIsms[Math.floor(Math.random() * this.kaiIsms.length)];
    }

    getSuccessMessage() {
        return this.successPhrases[Math.floor(Math.random() * this.successPhrases.length)];
    }

    getErrorMessage() {
        return this.errorPhrases[Math.floor(Math.random() * this.errorPhrases.length)];
    }

    getThinkingMessage() {
        return this.thinkingPhrases[Math.floor(Math.random() * this.thinkingPhrases.length)];
    }

    /**
     * Add Kai flavor to a response
     * @param {string} text - Original text
     * @param {string} type - Response type (answer/success/error/tutorial)
     * @returns {string} Kai-ified text
     */
    addFlavor(text, type = 'answer') {
        const prefixes = {
            answer: [
                ">_ Output:",
                "Analyzing... Here's the data:",
                "I've parsed the docs. Check this:",
                "Logic dictates:"
            ],
            success: [
                "[SUCCESS] ::",
                ">_ Operation Complete.",
                "Mission Accomplished.",
                "System Green."
            ],
            error: [
                "[ERROR] ::",
                ">_ Exception Caught.",
                "System Alert.",
                "Critical Failure."
            ],
            tutorial: [
                "Downloading Knowledge...",
                "Tutorial Mode: ENGAGED.",
                "Listen up, cadet.",
                "Here's the cheat code:"
            ]
        };

        const prefix = prefixes[type][Math.floor(Math.random() * prefixes[type].length)];
        
        // Add occasional Kai-isms at the end
        let result = `${prefix} ${text}`;
        
        if (Math.random() < 0.3) {
            result += `\n\n// ${this.getRandomIsm()}`;
        }

        return result;
    }

    /**
     * Convert generic responses to Kai style
     */
    irabify(text) { // Kept method name for compatibility, but logic is Kai
        // Replace generic phrases
        const replacements = {
            "I can": "I can execute",
            "You can": "You have permission to",
            "Let me": "Initiating sequence to",
            "I'll": "I will",
            "I'm": "I am",
            "Here's": "Outputting",
            "That's": "That is",
            "It's": "It is"
        };

        let result = text;
        for (const [from, to] of Object.entries(replacements)) {
            result = result.replace(new RegExp(from, 'g'), to);
        }

        return result;
    }

    /**
     * Get a contextual tip
     */
    getContextTip(context) {
        const tips = {
            npc: [
                "NPCs need souls. Or at least good AI.",
                "Don't make them too smart, or they'll take over.",
                "Give this NPC a cool backstory."
            ],
            quest: [
                "Fetch quests are so 2004. Get creative.",
                "Make the reward legendary.",
                "Is the princess in another castle?"
            ],
            dialogue: [
                "Branching paths? Nice.",
                "Keep it snappy. Players don't read.",
                "Add a sarcasm option."
            ],
            build: [
                "Compiling... Cross your fingers.",
                "If it builds, ship it.",
                "Watch out for memory leaks."
            ]
        };

        if (context in tips) {
            return tips[context][Math.floor(Math.random() * tips[context].length)];
        }

        return this.getRandomIsm();
    }
}

// Make available globally
window.IRABPersonality = KaiPersonality; // Keep global name for compatibility
