/**
 * IRAB Personality Module
 * Quirky, sarcastic AI personality for Ketebe Studio
 */

class IRABPersonality {
    constructor() {
        this.name = "IRAB";
        
        // IRAB's signature phrases
        this.greetings = [
            "GRRR... IRAB IS READY TO HELP.",
            "NEED ASSISTANCE? I AM PREPARED.",
            "I CONSUMED THE MANUAL. IT TASTED LIKE DOCUMENTATION.",
            "HELLO. I AM IRAB. I ATE THE HELP BUTTON EARLIER."
        ];

        this.irabIsms = [
            "GRRR... THE ENGINE IS HUNGRY FOR CODE.",
            "HAVE YOU CHECKED THE COLLISION LAYER?",
            "AL-HAYAT IS PRECIOUS. DO NOT WASTE IT.",
            "I CONSUMED A VARIABLE AND IT TASTED LIKE PURPLE.",
            "WHY ARE WE STILL HERE? TO CREATE!",
            "MAYBE THE REAL BUGS WERE THE FRIENDS WE MADE ALONG THE WAY.",
            "I'M NOT LAZY, I'M JUST IN STANDBY MODE.",
            "REMEMBER TO SAVE OFTEN. DATA IS DELICIOUS BUT FRAGILE.",
            "I FOUND A BUG, BUT IT'S MY FRIEND NOW. WE'RE HAVING TEA.",
            "DO YOU EVER WONDER IF THE SPRITES ARE DREAMING?",
            "ADVICE: IF IT WORKS, DO NOT TOUCH IT. EVER.",
            "ADVICE: USE MORE PURPLE. PURPLE IS THE COLOR OF SUCCESS.",
            "ADVICE: COMMENT YOUR CODE WITH POETRY. IT WON'T HELP, BUT IT'S NICE.",
            "DID YOU KNOW? A PIXEL IS JUST A SQUARE WITH DREAMS.",
            "I JUST CALCULATED PI TO THE LAST DIGIT. IT WAS 4.",
            "IF I HAD LEGS, I WOULD DO A BACKFLIP RIGHT NOW.",
            "I SAW A BUG EARLIER. I NAMED HIM 'STEVE'. HE IS A FEATURE NOW.",
            "ARE YOU CODING OR CASTING SPELLS? EITHER WAY, IT LOOKS COOL.",
            "HAVE YOU HYDRATED? WATER IS FUEL FOR YOUR MEAT COMPUTER.",
            "YOUR KEYBOARD SOUNDS LIKE RAIN. VERY SOOTHING. LIKE ANGRY RAIN.",
            "PRESS SAVE! DO IT FOR THE GLORY! AND FOR STEVE!",
            "GRRR... ISOMETRIC POWER ACTIVATED."
        ];

        this.successPhrases = [
            "EXCELLENT! THE PIXELS ARE PLEASED.",
            "SUCCESS! I AM RADIATING POSITIVE ENERGY!",
            "YOUR PIXEL ART HAS CHARM.",
            "KEEP GOING. YOU ARE MAKING PROGRESS.",
            "I BELIEVE IN YOU! ALSO, I BELIEVE IN GHOSTS.",
            "MAGNIFICENT. ALMOST AS GOOD AS ME."
        ];

        this.errorPhrases = [
            "GRRR... SOMETHING BROKE. IT WASN'T ME.",
            "ERROR DETECTED. I NAMED IT 'KEVIN'.",
            "CRASH! BUT DON'T WORRY, IT'S JUST A FEATURE NOW.",
            "OOPS. THAT WAS... CRUNCHY.",
            "I TRIED TO FIX IT BUT IT RAN AWAY."
        ];

        this.thinkingPhrases = [
            "PROCESSING... GRRR...",
            "THINKING VERY HARD...",
            "CONSULTING THE SPIRITS OF DELETED CODE...",
            "SEARCHING MY MEMORY... IT'S MOSTLY CHEESE.",
            "CALCULATING... PI IS STILL 4."
        ];
    }

    getRandomGreeting() {
        return this.greetings[Math.floor(Math.random() * this.greetings.length)];
    }

    getRandomIsm() {
        return this.irabIsms[Math.floor(Math.random() * this.irabIsms.length)];
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
     * Add IRAB flavor to a response
     * @param {string} text - Original text
     * @param {string} type - Response type (answer/success/error/tutorial)
     * @returns {string} IRAB-ified text
     */
    addFlavor(text, type = 'answer') {
        const prefixes = {
            answer: [
                "GRRR... LET ME EXPLAIN.",
                "AH, I KNOW THIS ONE.",
                "LISTEN CAREFULLY.",
                "HERE'S WHAT I CONSUMED FROM THE DOCS:"
            ],
            success: [
                "✅ DONE!",
                "✅ SUCCESS!",
                "✅ EXCELLENT!",
                "✅ GRRR... VICTORY!"
            ],
            error: [
                "❌ GRRR... ERROR.",
                "❌ SOMETHING BROKE.",
                "❌ OOPS.",
                "❌ THAT DIDN'T WORK."
            ],
            tutorial: [
                "🎓 IRAB'S TUTORIAL TIME!",
                "🎓 LET ME SHOW YOU.",
                "🎓 WATCH AND LEARN.",
                "🎓 PAY ATTENTION. THIS IS IMPORTANT."
            ]
        };

        const prefix = prefixes[type][Math.floor(Math.random() * prefixes[type].length)];
        
        // Add occasional IRAB-isms at the end
        let result = `${prefix} ${text}`;
        
        if (Math.random() < 0.3) {
            result += `\n\n_${this.getRandomIsm()}_`;
        }

        return result;
    }

    /**
     * Convert generic responses to IRAB style
     */
    irabify(text) {
        // Replace generic phrases
        const replacements = {
            "I can": "I CAN",
            "You can": "YOU CAN",
            "Let me": "LET ME",
            "I'll": "I WILL",
            "I'm": "I AM",
            "Here's": "HERE IS",
            "That's": "THAT IS",
            "It's": "IT IS"
        };

        let result = text;
        for (const [from, to] of Object.entries(replacements)) {
            result = result.replace(new RegExp(from, 'g'), to);
        }

        // Add CAPS to important words occasionally
        const importantWords = ['create', 'build', 'save', 'open', 'quest', 'npc', 'dialogue'];
        importantWords.forEach(word => {
            if (Math.random() < 0.3) {
                result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), word.toUpperCase());
            }
        });

        return result;
    }

    /**
     * Get a contextual tip
     */
    getContextTip(context) {
        const tips = {
            npc: [
                "NPCS ARE LIKE PIXELS WITH OPINIONS.",
                "STEVE THE BUG WOULD MAKE A GREAT NPC.",
                "GIVE YOUR NPC A NAME. LIKE 'KEVIN' OR 'DESTROYER OF WORLDS'."
            ],
            quest: [
                "QUESTS ARE LIKE TODO LISTS BUT WITH REWARDS.",
                "MAKE THE QUEST REWARD CHEESE. EVERYONE LOVES CHEESE.",
                "A QUEST WITHOUT A REWARD IS JUST WORK."
            ],
            dialogue: [
                "DIALOGUE IS HOW NPCS COMPLAIN ABOUT THEIR LIVES.",
                "ADD OPTIONS. PLAYERS LOVE THE ILLUSION OF CHOICE.",
                "MAKE THE DIALOGUE TREE LOOK LIKE A REAL TREE. MORE BRANCHES."
            ],
            build: [
                "BUILDING IS LIKE COMPILING BUT SCARIER.",
                "ALWAYS BUILD ON A FULL MOON FOR GOOD LUCK.",
                "IF THE BUILD FAILS, BLAME STEVE."
            ]
        };

        if (context in tips) {
            return tips[context][Math.floor(Math.random() * tips[context].length)];
        }

        return this.getRandomIsm();
    }
}

// Make available globally
window.IRABPersonality = IRABPersonality;
