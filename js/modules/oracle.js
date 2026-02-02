export class OracleSteward {
    constructor() {
        // Using Puter AI for Maximum Connectivity and Stability
        this.model = "gpt-4o";
        this.chatHistory = [];

        this.elements = {
            input: document.getElementById('oracle-input'),
            send: document.getElementById('oracle-send'),
            messages: document.getElementById('oracle-messages'),
            status: document.getElementById('oracle-status'),
        };
    }

    async init() {
        this.elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        if (this.elements.send) {
            this.elements.send.onclick = () => this.handleSend();
        }

        this.elements.status.textContent = "Vault AI: Active";
    }

    addMessage(sender, text, type) {
        const msg = document.createElement('div');
        msg.className = `message ${type}`;
        msg.textContent = text;
        this.elements.messages.appendChild(msg);
        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }

    async handleSend() {
        const text = this.elements.input.value.trim();
        if (!text) return;

        this.elements.input.value = '';
        this.addMessage("You", text, "user");
        this.elements.status.textContent = "Steward is contemplating...";

        // System Instruction Context
        const systemPrompt = "You are the 'Steward', a formal, professional, and highly respectful personal assistant. Your tone is institutional and sophisticated. You reside within the 'One Touch' sovereign dashboard. Provide concise but elegant responses.";

        const fullPrompt = `${systemPrompt}\n\nUser Question: ${text}`;

        const aiMsgElement = document.createElement('div');
        aiMsgElement.className = "message steward";
        aiMsgElement.textContent = "...";
        this.elements.messages.appendChild(aiMsgElement);

        try {
            // Using Puter.js AI Chat (No API keys or CORS issues)
            const response = await puter.ai.chat(fullPrompt, { model: this.model });

            // Puter returns a message object or string depending on version
            const aiText = typeof response === 'string' ? response : (response.message ? response.message.content : response);

            aiMsgElement.textContent = aiText;
            this.chatHistory.push({ role: "user", content: text });
            this.chatHistory.push({ role: "assistant", content: aiText });

            this.elements.status.textContent = "Vault AI: Active";

        } catch (e) {
            console.error("Puter AI Error:", e);
            aiMsgElement.textContent = "I apologize. My connection to the Puter cloud was interrupted. Please ensure you are connected to the internet.";
            this.elements.status.textContent = "Connection Error";
        }

        this.elements.messages.scrollTop = this.elements.messages.scrollHeight;
    }
}
