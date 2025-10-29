/* app.js
   Minimal interactive frontend for SmartStorm AI demo.
   - Shows a MapLibre map centered on Washington, DC.
   - Loads mock GSI assets with Maintenance Risk Index (MRI).
   - Lets you "generate" a simple weekly plan by dividing top sites among crews.
   - Simple chatbot UI that stores reports in localStorage and optionally POSTs to a backend.
 
   To connect to a real backend:
   - Set BACKEND_URL to your API base (e.g. "https://smartstorm-backend.onrender.com")
   - The code will POST maintenance requests to `${BACKEND_URL}/requests` (example).
*/

///////////////////////
// CONFIG (edit me) //
///////////////////////
const BACKEND_URL = ""; // <-- If you have a backend, put it here (no trailing slash). If empty, chatbot stores locally.

///////////////////////
// MOCK DATA (demo)  //
///////////////////////

// A small mock dataset: asset_id, name, coordinates [lon, lat], MRI (0-100)
const mockAssets = [
  { asset_id: "A-001", name: "Bioswale - 5th & K", geom: [-77.0113, 38.9007], mri: 82 },
  { asset_id: "A-002", name: "Rain Garden - 12th & L", geom: [-77.0252, 38.9072], mri: 57 },
  { asset_id: "A-003", name: "Permeable Pavement - 3rd & H", geom: [-77.0320, 38.8896], mri: 71 },
  { asset_id: "A-004", name: "Green Roof - City Hall", geom: [-77.0365, 38.8971], mri: 45 },
  { asset_id: "A-005", name: "Swale - 7th & G", geom: [-77.0205, 38.9101], mri: 92 }
];

///////////////////////
// MAP INITIALIZATION //
///////////////////////
const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json", // public demo style
  center: [-77.0369, 38.9072],
  zoom: 12
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

// Add assets as circle markers and popup
map.on("load", () => {
  mockAssets.forEach(asset => {
    // create a HTML element for each marker (so we can style)
    const el = document.createElement("div");
    el.className = "marker";
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.borderRadius = "50%";
    // color by mri (green -> red)
    const intensity = Math.min(1, asset.mri / 100);
    const r = Math.round(255 * intensity);
    const g = Math.round(200 * (1 - intensity));
    el.style.background = `rgb(${r},${g},80)`;
    el.style.border = "2px solid rgba(0,0,0,0.4)";

    const popup = new maplibregl.Popup({ offset: 12 }).setHTML(`
      <strong>${asset.name}</strong><br/>
      Asset ID: ${asset.asset_id}<br/>
      MRI: ${asset.mri}
    `);

    new maplibregl.Marker(el)
      .setLngLat(asset.geom)
      .setPopup(popup)
      .addTo(map);
  });

  // Fit map bounds to assets
  const bounds = mockAssets.reduce((b, a) => b.extend(a.geom), new maplibregl.LngLatBounds(mockAssets[0].geom, mockAssets[0].geom));
  map.fitBounds(bounds, { padding: 80 });
});

///////////////////////
// RISK LIST UI      //
///////////////////////
function renderRiskList() {
  const ul = document.getElementById("risk-list");
  ul.innerHTML = "";
  // sort by mri desc
  const sorted = [...mockAssets].sort((a,b) => b.mri - a.mri);
  sorted.forEach(a => {
    const li = document.createElement("li");
    li.className = "risk-item";
    li.innerHTML = `
      <div>
        <strong>${a.name}</strong><br/>
        <small class="muted">ID: ${a.asset_id}</small>
      </div>
      <div class="risk-score">${a.mri}</div>
    `;
    li.onclick = () => {
      // center map on click
      map.flyTo({ center: a.geom, zoom: 15 });
    };
    ul.appendChild(li);
  });
}
renderRiskList();

///////////////////////
// SIMPLE PLANNER    //
///////////////////////
// Very simple planner: takes top sites and assigns them to crews in round-robin.
document.getElementById("generate-plan").addEventListener("click", () => {
  const crewCount = Math.max(1, parseInt(document.getElementById("crew-count").value || "1"));
  const sorted = [...mockAssets].sort((a,b) => b.mri - a.mri);
  // take top 5 for demo
  const top = sorted.slice(0, 5);
  const crews = Array.from({length: crewCount}, (_,i)=>[]);
  top.forEach((site, idx) => {
    crews[idx % crewCount].push(site);
  });

  const out = document.getElementById("plan-output");
  out.innerHTML = "";
  crews.forEach((c, idx) => {
    const div = document.createElement("div");
    div.style.marginBottom = "8px";
    div.innerHTML = `<strong>Crew ${idx+1}</strong>: ${c.map(x=>x.name + " (MRI:"+x.mri+")").join(" → ") || "<em>No assignments</em>"}`;
    out.appendChild(div);
  });
});

///////////////////////
// CHATBOT (simple)  //
///////////////////////
// Chat UI stores messages in localStorage and optionally posts to BACKEND_URL.

const chatWindow = document.getElementById("chat-window");
const chatText = document.getElementById("chat-text");
const chatSend = document.getElementById("chat-send");

// Load saved chat messages
const saved = JSON.parse(localStorage.getItem("smartstorm_chat") || "[]");
saved.forEach(m => pushChatMessage(m.from, m.text, false));

chatSend.addEventListener("click", sendChat);
chatText.addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });

async function sendChat() {
  const text = chatText.value.trim();
  if (!text) return;
  pushChatMessage("user", text, true);
  chatText.value = "";

  // Basic bot response (mock) - in production use LLM + RAG + geocoding
  const intent = classifyIntent(text);
  if (intent === "report") {
    // try to extract a location (very naive): numbers & &
    const nearest = findNearestAssetByText(text);
    if (nearest) {
      pushChatMessage("bot", `Thanks — I linked this to ${nearest.name} (ID ${nearest.asset_id}). Creating a maintenance request...`, true);
      // Create a local request object
      const req = {
        request_id: cryptoRandomId(),
        asset_id: nearest.asset_id,
        text,
        created_at: new Date().toISOString()
      };
      // Save locally
      const reqs = JSON.parse(localStorage.getItem("smartstorm_requests") || "[]");
      reqs.push(req);
      localStorage.setItem("smartstorm_requests", JSON.stringify(reqs));
      // Optionally POST to backend
      if (BACKEND_URL) {
        try {
          const res = await fetch(BACKEND_URL + "/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reporter_id: "web-demo",
              lat: nearest.geom[1],
              lon: nearest.geom[0],
              description: text,
              attachments: {}
            })
          });
          if (res.ok) {
            const data = await res.json();
            pushChatMessage("bot", `Request submitted. Server response: ${JSON.stringify(data)}`, true);
          } else {
            pushChatMessage("bot", `Failed to submit request to backend (status ${res.status}). Saved locally.` , true);
          }
        } catch(err) {
          pushChatMessage("bot", `Could not reach backend: ${err.message}. Saved locally.` , true);
        }
      } else {
        pushChatMessage("bot", `Saved request locally (demo mode). Request ID: ${req.request_id}`, true);
      }
    } else {
      pushChatMessage("bot", "Thanks — I got the report but couldn't confidently match a nearby asset. Can you provide an address or drop a pin?", true);
    }
  } else if (intent === "info") {
    pushChatMessage("bot", "This demo shows risk scores per site. For full details connect a backend with predictive models.", true);
  } else {
    pushChatMessage("bot", "Thanks — I've recorded that. If this is an urgent hazard, please call emergency services.", true);
  }

  // Persist chat
  persistChat();
}

// Utility: push chat message to UI
function pushChatMessage(from, text, scroll=true) {
  const div = document.createElement("div");
  div.className = "chat-msg " + (from === "user" ? "user" : "bot");
  div.textContent = text;
  chatWindow.appendChild(div);
  if (scroll) chatWindow.scrollTop = chatWindow.scrollHeight;

  // Save to local storage array
  const arr = JSON.parse(localStorage.getItem("smartstorm_chat") || "[]");
  arr.push({ from, text, ts: new Date().toISOString()});
  localStorage.setItem("smartstorm_chat", JSON.stringify(arr));
}

// Persist chat (simple wrapper)
function persistChat() {
  // already saved on push
  renderSavedCounts();
}

// Naive intent classifier (demo only)
function classifyIntent(text) {
  const t = text.toLowerCase();
  if (t.match(/(flood|water|standing|overflow|clog)/)) return "report";
  if (t.match(/(status|how|when|plan|schedule)/)) return "info";
  return "other";
}

// Very naive "find nearest asset" via keyword match
function findNearestAssetByText(text) {
  const t = text.toLowerCase();
  for (const a of mockAssets) {
    const nameLower = a.name.toLowerCase();
    // match on street number or fragment
    if (t.includes(a.name.split(" - ")[0].toLowerCase()) || t.includes(nameLower.split(" - ")[0])) return a;
    // crude: match on common street names / numbers
    const tokens = nameLower.split(/\W+/);
    if (tokens.some(tok => tok && t.includes(tok))) return a;
  }
  return null;
}

// tiny crypto-like id for demo
function cryptoRandomId() {
  return 'r_' + Math.random().toString(36).slice(2,10);
}

// show counts in UI (optional)
function renderSavedCounts() {
  const reqs = JSON.parse(localStorage.getItem("smartstorm_requests") || "[]");
  // you could show counts somewhere; for brevity we'll console.log
  console.log(`Saved requests: ${reqs.length}`);
}
renderSavedCounts();

///////////////////////
// HELPERS (optional) //
///////////////////////
// You can expand these to call geocoders, ML endpoints, or RAG retrieval.
