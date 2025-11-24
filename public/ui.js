// public/ui.js
const consoleBox = document.getElementById('console');
const input = document.getElementById('input');
const btnRandom = document.getElementById('btnRandom');
const btnClear = document.getElementById('btnClear');
const btnKey = document.getElementById('btnKey');
const btnCopy = document.getElementById('btnCopy');
const apiKeyBox = document.getElementById('apiKeyBox');
const btnSaveUser = document.getElementById('btnSaveUser');

const firstnameEl = document.getElementById('firstname');
const lastnameEl = document.getElementById('lastname');
const emailEl = document.getElementById('email');

let lastGeneratedKey = null;
let savedUserId = null;
let heartbeatInterval = null;

function printToConsole(text, color = '#00fff0') {
  const line = document.createElement('div');
  line.innerHTML = `<span style="color:${color}">${text}</span>`;
  consoleBox.appendChild(line);
  consoleBox.scrollTop = consoleBox.scrollHeight;
}

async function fetchAPI(endpoint) {
  try {
    const res = await fetch(endpoint);
    const data = await res.json();
    printToConsole(`Response from ${endpoint}:`, '#00ff88');
    printToConsole(JSON.stringify(data, null, 2), '#ffffff');
    return data;
  } catch (err) {
    printToConsole(`Error: ${err.message}`, '#ff4444');
  }
}

function handleCommand(cmd) {
  const command = cmd.trim().toLowerCase();
  if (!command) return;
  printToConsole(`> ${command}`, '#ff007c');
  if (command === 'help') {
    printToConsole("Commands: help, about, clear, time, testapi /api/test, validate /api/validate?key=...", '#9f');
  } else if (command === 'about') {
    printToConsole('UwUntu Cyber Console — API Key Generator Interface.', '#00ff88');
  } else if (command === 'time') {
    printToConsole(`System time: ${new Date().toLocaleTimeString()}`);
  } else if (command === 'clear') {
    consoleBox.innerHTML = '';
  } else if (command.startsWith('testapi')) {
    const endpoint = command.split(' ')[1] || '/api/test';
    fetchAPI(endpoint);
  } else {
    printToConsole(`Unknown command: ${command}`, '#ff0044');
  }
}

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { handleCommand(input.value); input.value = ''; }
});

btnRandom.addEventListener('click', () => {
  printToConsole('> ⚡ Requesting /api/test...', '#ff007c');
  fetchAPI('/api/test');
});

btnKey.addEventListener('click', async () => {
  printToConsole('> 🔑 Generating UwUntu API Key (client requests server, key is NOT saved yet)...', '#ff007c');
  const data = await fetchAPI('/api/generate-key');
  if (data && data.apiKey) {
    lastGeneratedKey = data.apiKey;
    apiKeyBox.innerText = data.apiKey;
    printToConsole('> API key generated (not saved). Review fields then press Save.', '#00ff88');
  }
});

btnCopy.addEventListener('click', async () => {
  if (!lastGeneratedKey) { printToConsole('> ❌ No API key to copy!', '#ff4444'); return; }
  try { await navigator.clipboard.writeText(lastGeneratedKey); printToConsole('> ✅ API key copied to clipboard!', '#00ff88'); }
  catch (e) { printToConsole('> ❌ Copy failed', '#ff4444'); }
});

btnClear.addEventListener('click', () => { consoleBox.innerHTML = ''; printToConsole('> Console cleared.', '#00fff0'); });

// Save user + key endpoint
btnSaveUser.addEventListener('click', async () => {
  const firstname = firstnameEl.value.trim();
  const lastname = lastnameEl.value.trim();
  const email = emailEl.value.trim();
  const apiKey = lastGeneratedKey;

  if (!firstname || !lastname || !email || !apiKey) {
    printToConsole('> ❌ fill firstname, lastname, email and generate an API key first.', '#ff4444');
    return;
  }

  printToConsole('> 💾 Saving user + API key to server...', '#ff007c');
  try {
    const res = await fetch('/api/save-user', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ firstname, lastname, email, apiKey })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'save failed');

    printToConsole('> ✅ Saved: ' + JSON.stringify(data.user), '#00ff88');
    savedUserId = data.user.id;

    // start heartbeat to mark online
    await fetch(`/api/user/${savedUserId}/online`, { method: 'POST' }).catch(()=>{});
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(()=>{ fetch(`/api/user/${savedUserId}/online`, { method: 'POST' }).catch(()=>{}); }, 25000);

    // on unload, send offline via beacon
    window.addEventListener('beforeunload', () => {
      if (savedUserId) navigator.sendBeacon(`/api/user/${savedUserId}/offline`);
    });

  } catch (err) {
    printToConsole('> ❌ Save error: ' + (err.message || 'unknown'), '#ff4444');
  }
});

window.addEventListener('load', () => { printToConsole('> Booting UwUntu Cyber Console...'); setTimeout(()=>printToConsole("> Type 'help' or use the buttons below.", '#9f'), 900); });