// ===== CRYPTO (AES-GCM) =====
async function deriveKey(secret) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode('segredex-salt'),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// ===== UTILS =====
function toBase64Url(str) {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return str;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function encrypt(text, secret) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(secret);
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(text)
    );
    const buff = new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
    // Using Base64URL
    return toBase64Url(btoa(String.fromCharCode(...buff)));
}

async function decrypt(payload, secret) {
    // Decoding Base64URL
    const raw = Uint8Array.from(atob(fromBase64Url(payload)), c => c.charCodeAt(0));
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const key = await deriveKey(secret);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );
    return new TextDecoder().decode(decrypted);
}

// ===== UI LOGIC =====
function renderLinkList(results) {
    document.getElementById('admin').classList.add('hidden');
    document.getElementById('links').classList.remove('hidden');

    const list = document.getElementById('list');
    list.innerHTML = '';

    results.forEach(({ giver, url }) => {
        const div = document.createElement('div');
        div.className = 'list-item';

        const nameSpan = document.createElement('div');
        nameSpan.className = 'participant-name';
        nameSpan.innerText = giver.name;

        const actions = document.createElement('div');
        actions.className = 'actions';

        const copy = document.createElement('button');
        copy.innerText = 'Copiar Link';
        copy.onclick = async () => {
            try {
                await navigator.clipboard.writeText(url);
                copy.innerText = 'Copiado!';
                setTimeout(() => copy.innerText = 'Copiar Link', 1500);
            } catch {
                alert('Erro ao copiar automaticamente.');
            }
        };

        const wa = document.createElement('a');
        wa.href = `https://wa.me/?text=${encodeURIComponent(`Oii ${giver.name}! 🎁\n\nAbra este link para descobrir seu Amigo Oculto:\n${url}`)}`;
        wa.target = '_blank';
        wa.className = 'btn wa';
        wa.innerText = 'WhatsApp';

        actions.appendChild(copy);
        actions.appendChild(wa);

        div.appendChild(nameSpan);
        div.appendChild(actions);
        list.appendChild(div);
    });
}

function resetDraw() {
    if (confirm('Tem certeza? Isso apagará o sorteio atual.')) {
        sessionStorage.removeItem('opendraw_results');
        location.reload();
    }
}

// ===== GENERATE =====
async function generate() {
    const btn = document.getElementById('btnGenerate');
    const originalText = btn.innerText;

    const lines = document.getElementById('names').value
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    const people = lines.map(name => ({ name }));

    if (people.length < 3) {
        alert('Informe pelo menos 3 participantes');
        return;
    }

    try {
        btn.innerText = 'Criptografando...';
        btn.disabled = true;
        btn.style.cursor = 'wait';

        await new Promise(r => requestAnimationFrame(r));
        await new Promise(r => setTimeout(r, 50));

        const names = people.map(p => p.name);

        // Validation: verify duplicates
        if (new Set(names).size !== names.length) {
            throw new Error('Existem nomes duplicados na lista.');
        }

        let shuffled = [...names];
        let attempts = 0;
        do {
            shuffle(shuffled);
            attempts++;
            if (attempts > 1000) throw new Error('Falha ao sortear: impossível satisfazer condições.');
        } while (names.some((n, i) => n === shuffled[i]));

        const results = await Promise.all(people.map(async (giver, i) => {
            const receiver = shuffled[i];
            const encrypted = await encrypt(receiver, giver.name);
            const url = `${location.origin}${location.pathname}?u=${encodeURIComponent(giver.name)}&k=${encrypted}`;
            return { giver, url };
        }));

        // Save to session storage
        sessionStorage.setItem('opendraw_results', JSON.stringify(results));

        renderLinkList(results);

    } catch (e) {
        console.error(e);
        alert('Erro ao gerar sorteio: ' + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
        btn.style.cursor = 'pointer';
    }
}

// ===== INIT =====
async function init() {
    // 1. Check for stored session (Admin refresh)
    const stored = sessionStorage.getItem('opendraw_results');
    if (stored) {
        try {
            const results = JSON.parse(stored);
            renderLinkList(results);
            return; // Stop here, show admin view
        } catch (e) {
            console.error('Erro ao ler storage', e);
            sessionStorage.removeItem('opendraw_results');
        }
    }

    // 2. Check URL params (Viewer mode)
    const params = new URLSearchParams(location.search);
    if (!params.has('u') || !params.has('k')) return;

    const user = params.get('u');
    const payload = params.get('k');

    try {
        const result = await decrypt(payload, user);
        document.getElementById('viewerName').innerText = `Olá, ${user}!`;
        document.getElementById('viewerResult').innerText = result;
        document.getElementById('admin').classList.add('hidden');
        document.getElementById('viewer').classList.remove('hidden');
    } catch (e) {
        alert('Link inválido ou adulterado');
        console.error(e);
        document.getElementById('admin').classList.remove('hidden');
    }
}

init();
