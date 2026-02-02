// Database and Cryptography Handler for ONE TOUCH
// Using a new database name to ensure a clean migration
const db = new Dexie("OneTouchVault_PRO");

db.version(1).stores({
    ledger: '++id, date, type, category',
    quill: '++id, content, timestamp',
    settings: 'id, key, value',
    history: '++id, type, val, timestamp'
});

const CryptoHandler = {
    async getMasterKey(password) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );
        return crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: enc.encode("OneTouchSalt"),
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
        );
    },

    async encrypt(data, key) {
        const enc = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            enc.encode(JSON.stringify(data))
        );
        return {
            cipher: btoa(String.fromCharCode.apply(null, new Uint8Array(encrypted))),
            iv: btoa(String.fromCharCode.apply(null, iv))
        };
    },

    async decrypt(encryptedData, key) {
        const dec = new TextDecoder();
        const cipher = new Uint8Array(atob(encryptedData.cipher).split("").map(c => c.charCodeAt(0)));
        const iv = new Uint8Array(atob(encryptedData.iv).split("").map(c => c.charCodeAt(0)));
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            cipher
        );
        return JSON.parse(dec.decode(decrypted));
    }
};

export { db, CryptoHandler };
