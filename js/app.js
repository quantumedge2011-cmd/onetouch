import { db } from './db.js';
import { OracleSteward } from './modules/oracle.js';
import { SyncManager } from './sync.js';

// --- Initialization ---
let sync;
try {
    sync = new SyncManager();
    sync.init();

    const loginBtn = document.getElementById('google-login-btn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            sync.requestAccessToken();
        };
    }
} catch (e) {
    console.warn("Vault Authentication logic bypassed:", e);
}

// Global Exports
window.updateSaves = updateSaves;
window.updateLedger = updateLedger;

// --- The Dial (Clock) ---
function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('clock-display');
    const dateEl = document.getElementById('date-display');

    if (clockEl) clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: true });
    if (dateEl) dateEl.textContent = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}
setInterval(updateClock, 1000);
updateClock();

// --- The Reckoner (Calculator) ---
async function initReckoner() {
    const calcGrid = document.querySelector('.reckoner-grid');
    const calcDisplay = document.getElementById('calc-display');
    if (!calcGrid) return;

    const buttons = [
        '7', '8', '9', '/',
        '4', '5', '6', '*',
        '1', '2', '3', '-',
        '0', '.', 'C', '+',
        '=', 'sin', 'cos', 'tan'
    ];

    // Load last state
    let calcExpression = '';
    try {
        const lastCalc = await db.settings.get('calc_state');
        if (lastCalc) {
            calcExpression = lastCalc.value;
            calcDisplay.textContent = calcExpression || '0';
        }
    } catch (e) { }

    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn;
        button.className = 'calc-btn' + (['/', '*', '-', '+', '='].includes(btn) ? ' op' : '');

        button.onclick = async () => {
            if (btn === 'C') {
                calcExpression = '';
            } else if (btn === '=') {
                try {
                    let expr = calcExpression
                        .replace(/sin/g, 'Math.sin')
                        .replace(/cos/g, 'Math.cos')
                        .replace(/tan/g, 'Math.tan');
                    const rawResult = eval(expr);
                    const result = Number.isInteger(rawResult) ? rawResult : rawResult.toFixed(4);

                    // Save to history
                    await db.history.add({
                        type: 'Equation',
                        val: `${calcExpression} = ${result}`,
                        timestamp: Date.now()
                    });

                    calcExpression = result.toString();
                } catch (e) {
                    calcExpression = 'Error';
                }
            } else {
                if (calcExpression === 'Error') calcExpression = '';
                calcExpression += (['sin', 'cos', 'tan'].includes(btn) ? btn + '(' : btn);
            }
            calcDisplay.textContent = calcExpression || '0';

            // Auto-save state
            try {
                await db.settings.put({ id: 'calc_state', key: 'expression', value: calcExpression });
                updateSaves();
            } catch (e) { }
        };
        calcGrid.appendChild(button);
    });
}
initReckoner();

// --- The Quill (Notes) ---
const quillEditor = document.getElementById('quill-editor');
const quillStatus = document.getElementById('quill-status');
const quillSave = document.getElementById('quill-save');

async function saveNote(manual = false) {
    if (!quillEditor) return;
    const content = quillEditor.value;

    try {
        if (manual && content.trim()) {
            // RECORD: New entry
            await db.quill.add({ content, timestamp: Date.now() });
            quillStatus.textContent = 'Recorded';
            setTimeout(() => quillStatus.textContent = 'Saved', 2000);
        } else {
            // DRAFT
            await db.settings.put({ id: 'quill_draft', value: content });
            quillStatus.textContent = 'Saved';
        }

        // Sync to cloud
        if (sync) {
            const allLedger = await db.ledger.toArray();
            const allNotes = await db.quill.toArray();
            sync.syncToCloud({ quill_draft: content, quill_history: allNotes, ledger: allLedger });
        }
    } catch (e) {
        console.warn("Save Error:", e);
    }

    updateSaves();
}

async function loadNote() {
    if (!quillEditor) return;
    try {
        const draft = await db.settings.get('quill_draft');
        if (draft) quillEditor.value = draft.value;
    } catch (e) { }
}

if (quillEditor) {
    let quillTimeout;
    quillEditor.addEventListener('input', () => {
        quillStatus.textContent = 'Typing...';
        clearTimeout(quillTimeout);
        quillTimeout = setTimeout(() => saveNote(false), 1500);
    });

    if (quillSave) {
        quillSave.addEventListener('click', () => saveNote(true));
    }
    loadNote();
}

// --- The Ledger (Finance) ---
const ledgerAdd = document.getElementById('ledger-add');
const canvas = document.getElementById('balanceChart');
let balanceChart;

async function updateLedger() {
    if (!canvas) return;
    try {
        const entries = await db.ledger.toArray();
        const netTotalEl = document.getElementById('net-total');

        let total = 0;
        const labels = [];
        const data = [];

        entries.sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(entry => {
            const amt = parseFloat(entry.amount);
            if (entry.type === 'profit') total += amt;
            else total -= amt;

            labels.push(entry.date);
            data.push(total);
        });

        if (netTotalEl) netTotalEl.textContent = `rs ${total.toFixed(2)}`;

        if (balanceChart) balanceChart.destroy();
        balanceChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Balance History',
                    data: data,
                    borderColor: '#C5A059',
                    backgroundColor: 'rgba(197, 160, 89, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { display: false },
                    x: { display: false }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });
    } catch (e) { }
    updateSaves();
}

async function updateSaves() {
    const savesContainer = document.getElementById('saves-container');
    if (!savesContainer) return;

    try {
        const ledgerEntries = await db.ledger.toArray();
        const quillEntries = await db.quill.toArray();
        const historyEntries = await db.history.toArray();

        savesContainer.innerHTML = '';
        const allSaves = [];

        ledgerEntries.forEach(e => allSaves.push({ ...e, source: 'ledger', title: e.category || 'Finance', display: `rs ${e.amount} (${e.date})`, time: new Date(e.date).getTime() }));
        quillEntries.forEach(e => allSaves.push({ ...e, source: 'quill', title: 'Notepad', display: e.content.substring(0, 30) + '...', time: e.timestamp }));
        historyEntries.forEach(e => allSaves.push({ ...e, source: 'history', title: 'Equation', display: e.val, time: e.timestamp }));

        if (allSaves.length === 0) {
            savesContainer.innerHTML = `
                <div style="text-align: center; opacity: 0.6; padding: 30px; line-height: 1.6;">
                    <p style="font-size: 0.9rem; margin-bottom: 10px;">Your Vault is currently empty.</p>
                    <div style="font-size: 0.75rem; display: flex; flex-direction: column; gap: 8px; align-items: center;">
                        <span>📝 Record in Notepad</span>
                        <span>🔢 Hit '=' on Calculator</span>
                        <span>📊 Add Money Diary entry</span>
                    </div>
                </div>
            `;
            return;
        }

        allSaves.sort((a, b) => (b.time || 0) - (a.time || 0)).forEach(entry => {
            const item = document.createElement('div');
            item.className = 'save-item';
            item.innerHTML = `
                <div class="save-info">
                    <span class="save-category">${entry.title}</span>
                    <span class="save-val">${entry.display}</span>
                </div>
                <span class="delete-save" data-id="${entry.id}" data-source="${entry.source}">&times;</span>
            `;
            item.querySelector('.delete-save').onclick = async (e) => {
                const id = e.target.getAttribute('data-id');
                const source = e.target.getAttribute('data-source');
                if (source === 'ledger') await db.ledger.delete(parseInt(id));
                else if (source === 'quill') await db.quill.delete(parseInt(id));
                else if (source === 'history') await db.history.delete(parseInt(id));
                updateLedger();
                updateSaves();
            };
            savesContainer.appendChild(item);
        });
    } catch (e) {
        console.warn("Display Error:", e);
    }
}

if (ledgerAdd) {
    ledgerAdd.addEventListener('click', async () => {
        const dateInput = document.getElementById('ledger-date');
        const amountInput = document.getElementById('ledger-amount');
        const typeInput = document.getElementById('ledger-type');
        const categoryInput = document.getElementById('ledger-category');

        if (dateInput.value && amountInput.value) {
            try {
                await db.ledger.add({
                    date: dateInput.value,
                    amount: amountInput.value,
                    type: typeInput.value,
                    category: categoryInput.value
                });
                updateLedger();
                amountInput.value = '';
                categoryInput.value = '';
            } catch (err) { }
        }
    });
}

updateLedger();
updateSaves();

// --- The Map (Global Node) ---
function initMap() {
    if (!document.getElementById('map')) return;

    // Using provided MapTiler key for the tiles
    const MAP_STYLE = 'https://api.maptiler.com/maps/hybrid/style.json?key=sHT0uHQLziju6nuPnGkL';

    const map = new maplibregl.Map({
        container: 'map',
        style: MAP_STYLE,
        center: [0, 20],   // Starting position [lng, lat]
        zoom: 1.5,
        pitch: 45         // 3D Tilt for that premium look
    });

    // Adding a custom Open Source Marker
    const el = document.createElement('div');
    el.className = 'gold-marker';

    new maplibregl.Marker({ element: el })
        .setLngLat([0, 20])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML("<h3 style='color:var(--accent-color);'>The Vault</h3><p>Secure Node Active.</p>"))
        .addTo(map);
}

// Check for maplibregl availability before init
if (window.maplibregl) {
    initMap();
} else {
    window.addEventListener('load', () => {
        if (window.maplibregl) initMap();
    });
}

// --- The Oracle (AI) ---
const oracle = new OracleSteward();
oracle.init();
