// ===== Chatbot =====
const chatWindow = document.getElementById('chat-window');
const chatInput = document.getElementById('chat-text');
const chatSend = document.getElementById('chat-send');

// Backend URL
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

  // Check for ward number and add plan
  const wardNumber = extractWardNumber(msg);
  if (wardNumber) {
    addCrewPlanForWard(wardNumber);
    addMessage(`Added plan for Ward ${wardNumber}`, 'worker');
  }

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

// ==== Chatbot Planner ====
// Extract the first ward number mentioned in text
function extractWardNumber(text) {
  const match = text.match(/ward\s*(\d+)/i);
  return match ? match[1] : null;
}

// Add a crew plan to the planner for a specific ward
function addCrewPlanForWard(wardNumber) {
  const planOutput = document.getElementById('plan-output');

  const plan = document.createElement('div');
  plan.classList.add('crew-plan');
  plan.innerHTML = `<strong>Ward ${wardNumber}:</strong> Added via chatbot input`;
  
  planOutput.appendChild(plan);
}


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

function getRiskColor(risk) {
  // Example: low risk = green, medium = yellow, high = red
  if (risk >= 80) return '#e74c3c';      // high risk = red
  if (risk >= 50) return '#f1c40f';      // medium risk = yellow
  return '#2ecc71';                       // low risk = green
}

function updateHighRiskList() {
  const wards = wardsGeoJson.features
    .map(f => ({ 
      name: f.properties.WARD, 
      risk: f.properties.riskScore 
    }))
    .sort((a, b) => b.risk - a.risk);

  riskListEl.innerHTML = wards
    .map(w => `
      <div class="ward-card" style="background-color: ${getRiskColor(w.risk)};">
        <div class="ward-name">WARD ${w.name}</div>
        <div class="ward-risk">${w.risk}</div>
      </div>
    `)
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
    assignments[idx % crewsCount].push({
      ward: ward.name,
      risk: ward.risk
    });
  });

  const html = assignments.map((crew, i) => {
    return `<div class="crew-plan">
      <strong>Crew ${i + 1}:</strong>
      ${crew.map(w => {
        let color = w.risk > 66 ? 'red' : w.risk > 33 ? 'orange' : 'green';
        return `<div class="ward-line">
                  <span class="risk-bar" style="background-color:${color}"></span>
                  Ward ${w.ward} — Risk: ${w.risk}
                </div>`;
      }).join('')}
    </div>`;
  }).join('<br>');

  document.getElementById('plan-output').innerHTML = html;
});

