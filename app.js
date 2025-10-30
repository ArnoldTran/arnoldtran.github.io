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

  // Check for neighborhood number and add plan
  const wardNumber = extractWardNumber(msg);
  if (wardNumber) {
    addCrewPlanForWard(wardNumber);
    addMessage(`Added plan for Neighborhood ${wardNumber}`, 'worker');
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
// Extract the first neighborhood/ward number mentioned in text
function extractWardNumber(text) {
  const match = text.match(/(?:ward|neighborhood)\s*(\d+)/i);
  return match ? match[1] : null;
}

// Add a crew plan to the planner for a specific neighborhood
function addCrewPlanForWard(wardNumber) {
  const planOutput = document.getElementById('plan-output');
  const plan = document.createElement('div');
  plan.classList.add('crew-plan');
  plan.innerHTML = `<strong>Neighborhood ${wardNumber}:</strong> Added via chatbot input`;
  planOutput.appendChild(plan);
}


// ====== Map Initialization ======
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-77.0369, 38.9072],
  zoom: 10
});

// Add neighborhood GeoJSON and heat layer
let neighborhoodsGeoJson;
map.on('load', async () => {
  neighborhoodsGeoJson = await fetch('Neighborhood_Clusters.geojson').then(res => res.json());

  // Add a "riskScore" property for demo purposes
  neighborhoodsGeoJson.features.forEach(f => {
    f.properties.riskScore = Math.floor(Math.random() * 101);
  });

  map.addSource('neighborhoods', {
    type: 'geojson',
    data: neighborhoodsGeoJson
  });

  map.addLayer({
    id: 'neighborhoods-heat',
    type: 'fill',
    source: 'neighborhoods',
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

  // ===== Hover Popups =====
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false
  });

  map.on('mousemove', 'neighborhoods-heat', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const feature = e.features[0];
    const name = feature.properties.CLUSTER_NAME || feature.properties.NAME || "Unknown";
    const NBH = feature.properties.NBH_NAMES || feature.properties.CITY_LIST || "Unknown cities";
    popup.setLngLat(e.lngLat)
         .setHTML(`<strong>${name}</strong><br>Neighborhoods: ${NBH}`)
         .addTo(map);
  });

  map.on('mouseleave', 'neighborhoods-heat', () => {
    map.getCanvas().style.cursor = '';
    popup.remove();
  });
});


// ====== High Risk Sites ======
const riskListEl = document.getElementById('risk-list');

function getRiskColor(risk) {
  if (risk >= 80) return '#e74c3c'; // high = red
  if (risk >= 50) return '#f1c40f'; // medium = yellow
  return '#2ecc71'; // low = green
}

function updateHighRiskList() {
  const neighborhoods = neighborhoodsGeoJson.features
    .map(f => ({
      name: f.properties.CLUSTER_NAME || f.properties.NAME || f.properties.WARD || "Unknown",
      risk: f.properties.riskScore
    }))
    .sort((a, b) => b.risk - a.risk);

  riskListEl.innerHTML = neighborhoods
    .map(n => `
      <div class="ward-card" style="background-color: ${getRiskColor(n.risk)};">
        <div class="ward-name">${n.name}</div>
        <div class="ward-risk">${n.risk}</div>
      </div>
    `)
    .join('');
}


// ====== Generate Weekly Plan (High-Risk + Local Assignment) ======
function getCentroid(polygon) {
  const coords = polygon.coordinates[0];
  const n = coords.length;
  let x = 0, y = 0;
  coords.forEach(([lng, lat]) => { x += lng; y += lat; });
  return [x / n, y / n];
}

function distance([x1, y1], [x2, y2]) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx*dx + dy*dy);
}

document.getElementById('generate-plan').addEventListener('click', () => {
  const crewsCount = parseInt(document.getElementById('crew-count').value);

  // Only high-risk neighborhoods (risk >= 50)
  const highRiskNeighborhoods = neighborhoodsGeoJson.features
    .filter(f => f.properties.riskScore >= 50)
    .map(f => ({
      name: f.properties.CLUSTER_NAME || f.properties.NAME || f.properties.WARD || "Unknown",
      risk: f.properties.riskScore,
      centroid: getCentroid(f.geometry)
    }));

  // Initialize empty crews
  const assignments = Array.from({ length: crewsCount }, () => []);

  // Sort high-risk neighborhoods by risk descending
  highRiskNeighborhoods.sort((a, b) => b.risk - a.risk);

  // Assign neighborhoods to crews based on proximity
  highRiskNeighborhoods.forEach(n => {
    let bestCrewIdx = 0;
    let minDist = Infinity;

    assignments.forEach((crew, idx) => {
      if (crew.length === 0) {
        bestCrewIdx = idx;
        minDist = 0;
      } else {
        const last = crew[crew.length - 1];
        const d = distance(n.centroid, last.centroid);
        if (d < minDist) {
          minDist = d;
          bestCrewIdx = idx;
        }
      }
    });

    assignments[bestCrewIdx].push(n);
  });

  // Render the assignments
  const html = assignments.map((crew, i) => {
    return `<div class="crew-plan">
      <strong>Crew ${i + 1}:</strong>
      ${crew.map(w => {
        let color = w.risk > 66 ? 'red' : 'orange';
        return `<div class="ward-line">
                  <span class="risk-bar" style="background-color:${color}"></span>
                  ${w.name} — Risk: ${w.risk}
                </div>`;
      }).join('')}
    </div>`;
  }).join('<br>');

  document.getElementById('plan-output').innerHTML = html;
});
