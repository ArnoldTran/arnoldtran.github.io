// ===== Chatbot =====
const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-text');
const chatSend = document.getElementById('chat-send');

// Change this to your backend URL
const BACKEND_URL = "http://127.0.0.1:8000/api/chat";

function addMessage(message, sender) {
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('chat-msg', sender);
  msgDiv.textContent = message;
  chatWindow.appendChild(msgDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg) return;
  addMessage(msg, 'user');
  chatInput.value = '';

  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await response.json();
    addMessage(data.reply, 'worker');
  } catch (err) {
    addMessage("Error: Could not reach maintenance system.", 'worker');
  }
}

chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', e => { if(e.key==='Enter') sendMessage(); });

// ===== Map Demo (optional) =====
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-77.0369, 38.9072],
  zoom: 12
});
