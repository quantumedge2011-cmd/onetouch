import { CryptoHandler } from './db.js';

export class SyncManager {
    constructor() {
        this.clientId = "180234591489-k7gvoe3vt372eock3bqcs8ai1h31klli.apps.googleusercontent.com";
        this.accessToken = null;
        this.masterKey = null;
        this.currentUser = null;
    }

    init() {
        const startAuth = () => {
            if (typeof google === 'undefined' || !google.accounts) {
                console.warn("Vault Identity script not yet available. Retrying...");
                setTimeout(startAuth, 1000);
                return;
            }
            google.accounts.id.initialize({
                client_id: this.clientId,
                callback: (resp) => this.handleCredentialResponse(resp),
                auto_select: true,
                context: 'use'
            });
            google.accounts.id.prompt();
        };

        if (document.readyState === 'complete') {
            startAuth();
        } else {
            window.addEventListener('load', startAuth);
        }
    }

    async handleCredentialResponse(response) {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        this.currentUser = payload;

        // --- Update UI: Change Wax Seal to User Logo ---
        const loginBtn = document.getElementById('google-login-btn');
        if (loginBtn && payload.picture) {
            loginBtn.style.backgroundImage = `url(${payload.picture})`;
            loginBtn.style.backgroundSize = 'cover';
            loginBtn.style.border = '2px solid var(--accent-color)';
            loginBtn.style.boxShadow = '0 0 15px var(--accent-color)';
            loginBtn.classList.add('user-active'); // For transition effects
            loginBtn.title = `Accessing Vault: ${payload.name}`;
        }

        // Derive master key from user's unique Google ID (sub)
        this.masterKey = await CryptoHandler.getMasterKey(payload.sub);
        console.log("Vault Key Derived for", payload.email);

        this.requestAccessToken();
    }

    requestAccessToken() {
        const client = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: 'https://www.googleapis.com/auth/drive.appdata',
            callback: (tokenResponse) => {
                this.accessToken = tokenResponse.access_token;
                console.log("Access Token Acquired");
                // Initial sync check could go here
            },
        });
        client.requestAccessToken();
    }

    async syncToCloud(data) {
        if (!this.accessToken || !this.masterKey) {
            console.warn("Sync deferred: Authentication incomplete.");
            return;
        }

        const encryptedData = await CryptoHandler.encrypt(data, this.masterKey);

        const folder = 'appDataFolder';
        const filename = 'vault.json';

        try {
            const searchResp = await fetch(`https://www.googleapis.com/drive/v3/files?q=name='${filename}'&spaces=${folder}`, {
                headers: { 'Authorization': `Bearer ${this.accessToken}` }
            });
            const searchData = await searchResp.json();
            const fileId = searchData.files && searchData.files.length > 0 ? searchData.files[0].id : null;

            const metadata = {
                name: filename,
                parents: [folder]
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([JSON.stringify(encryptedData)], { type: 'application/json' }));

            let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            let method = 'POST';

            if (fileId) {
                url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
                method = 'PATCH';
            }

            const saveResp = await fetch(url, {
                method: method,
                headers: { 'Authorization': `Bearer ${this.accessToken}` },
                body: form
            });

            console.log("Encrypted Cloud Sync Complete");
        } catch (e) {
            console.error("Sync Error", e);
        }
    }
}
