const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let map, myMarker, accuracyCircle;
let myLocation = null;
const drivers = new Map();        // driver_id -> row from the database
const driverMarkers = new Map();  // driver_id -> Leaflet marker

// ---------- Map (your original code) ----------
function initMap() {
  map = L.map("map").setView([-26.2041, 28.0473], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
}

// ---------- GPS (your original code) ----------
function updateGPS(position) {
  const { latitude, longitude, accuracy } = position.coords;
  myLocation = { latitude, longitude };

  document.getElementById("gpsStatus").textContent = "GPS: live";
  document.getElementById("locationText").textContent =
    `${latitude.toFixed(5)}, ${longitude.toFixed(5)} (±${Math.round(accuracy)}m)`;

  if (!myMarker) {
    myMarker = L.marker([latitude, longitude]).addTo(map).bindPopup("You");
    accuracyCircle = L.circle([latitude, longitude], { radius: accuracy }).addTo(map);
    map.setView([latitude, longitude], 16);
  } else {
    myMarker.setLatLng([latitude, longitude]);
    accuracyCircle.setLatLng([latitude, longitude]).setRadius(accuracy);
  }
}

function gpsError(error) {
  document.getElementById("gpsStatus").textContent = "GPS: unavailable";
  document.getElementById("locationText").textContent =
    "Location permission required. Allow location for this app and try again.";
  console.warn(error);
}

// ---------- Connection status ----------
function setConn(text, ok) {
  const el = document.getElementById("connStatus");
  el.textContent = text;
  el.className = "pill " + (ok ? "ok" : "bad");
}

// ---------- Drivers ----------
function ageSeconds(row) {
  return (Date.now() - new Date(row.updated_at).getTime()) / 1000;
}

function isFresh(row) {
  return row.available && ageSeconds(row) <= STALE_AFTER_SECONDS;
}

function applyRow(row) {
  if (row.available) drivers.set(row.driver_id, row);
  else drivers.delete(row.driver_id);
  refresh();
}

// Draws the list and map from the drivers we know. Stale or offline taxis are removed.
function refresh() {
  const list = document.getElementById("driversList");
  list.innerHTML = "";

  const fresh = [...drivers.values()].filter(isFresh);

  // Markers: remove the ones that are gone, add/move the rest
  for (const [id, marker] of driverMarkers) {
    if (!fresh.find(d => d.driver_id === id)) {
      marker.remove();
      driverMarkers.delete(id);
    }
  }
  fresh.forEach(d => {
    let marker = driverMarkers.get(d.driver_id);
    if (!marker) {
      marker = L.marker([d.latitude, d.longitude]).addTo(map).bindPopup("🚐 Taxi " + (d.taxi_number || "available"));
      driverMarkers.set(d.driver_id, marker);
    } else {
      marker.setLatLng([d.latitude, d.longitude]);
    }
  });

  if (fresh.length === 0) {
    list.className = "empty";
    list.textContent = "No available taxis right now.";
    return;
  }
  list.className = "";

  fresh.forEach(d => {
    const row = document.createElement("div");
    row.className = "person";

    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = "🚐 Taxi " + (d.taxi_number || d.driver_id.slice(-4));   // textContent = safe, no HTML injection
    const sub = document.createElement("div");
    sub.className = "muted";
    const details = [d.vehicle, d.total_seats ? d.total_seats + " seats" : null].filter(Boolean).join(" · ");
    sub.textContent = `🟢 Available${details ? " · " + details : ""} · updated ${Math.round(ageSeconds(d))}s ago`;
    info.append(name, sub);

    const btn = document.createElement("button");
    btn.className = "small-btn";
    btn.textContent = "View";
    btn.onclick = () => map.setView([d.latitude, d.longitude], 17);

    row.append(info, btn);
    list.appendChild(row);
  });
}

// Load everything that is available right now (used at start and after reconnecting)
async function loadDrivers() {
  const { data, error } = await db.from("driver_locations").select("*").eq("available", true);
  if (error) { console.warn(error); setConn("Connection lost", false); return; }
  drivers.clear();
  data.forEach(row => drivers.set(row.driver_id, row));
  refresh();
}

// ---------- Realtime ----------
function listen() {
  db.channel("driver-locations")
    .on("postgres_changes", { event: "*", schema: "public", table: "driver_locations" },
      payload => { if (payload.new && payload.new.driver_id) applyRow(payload.new); })
    .subscribe(status => {
      if (status === "SUBSCRIBED") { setConn("Live", true); loadDrivers(); }
      else if (status === "CONNECTING" || status === "JOINING") setConn("Connecting...", false);
      else setConn("Connection lost. Reconnecting...", false);
    });
}

// Re-check ages every 5 seconds so stale taxis disappear on their own
setInterval(refresh, 5000);

window.addEventListener("offline", () => setConn("Connection lost", false));
window.addEventListener("online", () => loadDrivers());

// ---------- Start ----------
initMap();
setConn("Connecting...", false);
listen();

if ("geolocation" in navigator) {
  navigator.geolocation.watchPosition(updateGPS, gpsError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 10000
  });
} else {
  gpsError({ message: "Geolocation not supported." });
}
