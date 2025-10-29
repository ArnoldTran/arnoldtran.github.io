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

// ====== Map Initialization ======
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-77.0369, 38.9072],
  zoom: 10
});

// Add wards GeoJSON and heat layer
let wardsGeoJson;
map.on('load', async () => {
  wardsGeoJson = await fetch('wards2022.geojson').then(res => res.json());

  // Add a "riskScore" property to each ward for demo purposes
  wardsGeoJson.features.forEach(f => {
    f.properties.riskScore = Math.floor(Math.random() * 101);
  });

  map.addSource('wards', {
    type: 'geojson',
    data: wardsGeoJson
  });

  map.addLayer({
    id: 'wards-heat',
    type: 'fill',
    source: 'wards',
    paint: {
      'fill-color': [
        'interpolate',
        ['linear'],
        ['get', 'riskScore'],
        0, '#00ff00',
        50, '#ffff00',
        100, '#ff0000'
      ],
      'fill-opacity': 0.6
    
    }
  });

  updateHighRiskList();
});

// ====== High Risk Sites ======
const riskListEl = document.getElementById('risk-list');

function updateHighRiskList() {
  const wards = wardsGeoJson.features
    .map(f => ({ 
      name: f.properties.WARD, 
      risk: f.properties.riskScore 
    }))
    .sort((a, b) => b.risk - a.risk);

  riskListEl.innerHTML = wards
    .map(w => `<li>Ward ${w.name} — Risk: ${w.risk}</li>`)
    .join('');
}

// ====== Generate Weekly Plan ======
document.getElementById('generate-plan').addEventListener('click', () => {
  const crewsCount = parseInt(document.getElementById('crew-count').value);
  const wards = wardsGeoJson.features
    .map(f => ({ name: f.properties.WARD, risk: f.properties.riskScore }))
    .sort((a, b) => b.risk - a.risk);

  const assignments = Array.from({ length: crewsCount }, () => []);
  wards.forEach((ward, idx) => {
    assignments[idx % crewsCount].push(`${ward.name} (Risk: ${ward.risk})`);
  });

  const html = assignments.map((crew, i) =>
    `<strong>Crew ${i + 1}:</strong> ${crew.join(', ')}`
  ).join('<br>');

  document.getElementById('plan-output').innerHTML = html;
});

