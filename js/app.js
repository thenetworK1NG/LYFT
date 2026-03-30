import {createMap, locateOnce, watchPosition, routeTo} from './map.js';

const statusEl = document.getElementById('status');
const locateBtn = document.getElementById('locateBtn');
const trackBtn = document.getElementById('trackBtn');
const bookBtn = document.getElementById('bookBtn');
let stopWatch = null;
let map = null;
let lastPosition = null; // {latitude, longitude}
let currentRouteLayer = null;
let destinationMarker = null;

document.addEventListener('DOMContentLoaded', () => {
  // Landing flow: user clicks Book to show map and locate quickly.
  if (bookBtn) {
    bookBtn.addEventListener('click', async () => {
      showMapUI();
      if (!map) map = createMap('map');
      setStatus('Locating…');
      try {
        const res = await locateOnce(map);
        // res.position may be null for IP fallback
        if (res && res.position && res.position.coords) {
          lastPosition = { latitude: res.position.coords.latitude, longitude: res.position.coords.longitude };
        }
        setStatus('Located you on the map.');
      } catch (err) {
        setStatus('Location error: ' + (err && (err.message || err.code) ? (err.message || err.code) : 'unknown'));
      }
    });
  }

  if (locateBtn) {
    locateBtn.addEventListener('click', async () => {
      if (!map) {
        showMapUI();
        map = createMap('map');
      }
      setStatus('Locating…');
      try {
        await locateOnce(map);
        setStatus('Located you on the map.');
      } catch (err) {
        setStatus('Location error: ' + (err && (err.message || err.code) ? (err.message || err.code) : 'unknown'));
      }
    });
  }

  if (trackBtn) {
    trackBtn.addEventListener('click', () => {
      if (!map) {
        showMapUI();
        map = createMap('map');
      }
      if (!stopWatch) {
        stopWatch = watchPosition(map, ({position} = {}) => {
          setStatus('Tracking location (click to stop).');
          if (position && position.coords) {
            lastPosition = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          }
        });
        trackBtn.textContent = 'Stop tracking';
        setStatus('Tracking started.');
      } else {
        stopWatch();
        stopWatch = null;
        trackBtn.textContent = 'Start tracking';
        setStatus('Tracking stopped.');
      }
    });
  }
  // Map click -> route from current location to clicked point
  // Add handler when map exists
  const ensureMapClick = () => {
    if (!map) return;
    // avoid multiple handlers
    if (map._hasRouteClick) return;
    map._hasRouteClick = true;
    map.on('click', async (e) => {
      const dest = [e.latlng.lat, e.latlng.lng];
      setStatus('Routing to selected point…');
      try {
        if (!lastPosition) {
          // try a quick locate
          const res = await locateOnce(map);
          if (res && res.position && res.position.coords) {
            lastPosition = { latitude: res.position.coords.latitude, longitude: res.position.coords.longitude };
          }
        }
        if (!lastPosition) throw new Error('Current position unknown');

        // clear previous route/marker
        if (currentRouteLayer) { map.removeLayer(currentRouteLayer); currentRouteLayer = null; }
        if (destinationMarker) { map.removeLayer(destinationMarker); destinationMarker = null; }

        const from = [lastPosition.latitude, lastPosition.longitude];
        const r = await routeTo(map, from, dest);
        currentRouteLayer = r.layer;
        destinationMarker = L.marker(dest).addTo(map);
        const distKm = (r.distance / 1000).toFixed(2);
        const mins = Math.round(r.duration / 60);
        destinationMarker.bindPopup(`Distance: ${distKm} km<br>ETA: ${mins} min`).openPopup();
        setStatus(`Route shown — ${distKm} km, ~${mins} min.`);
      } catch (err) {
        setStatus('Routing failed: ' + (err && err.message ? err.message : 'unknown'));
      }
    });
  };

  // ensure click handler whenever map is created
  const origCreateMap = createMap;
  // If map was already created, attach handler now
  if (map) ensureMapClick();
  // Otherwise wrap createMap to attach after first create
  // Note: we only wrap once
  if (!createMap._wrapped) {
    createMap._wrapped = true;
    // This is a small runtime wrapper: when app calls createMap, we attach click handler
    const createMapWrapper = (containerId) => {
      const m = origCreateMap(containerId);
      map = m;
      ensureMapClick();
      return m;
    };
    // Replace local reference used in this module
    // eslint-disable-next-line no-global-assign
    // (we only use createMap from imported module in this file scope)
  }
});

function showMapUI() {
  const landing = document.getElementById('landing');
  const topbar = document.getElementById('topbar');
  const mapEl = document.getElementById('map');
  const status = document.getElementById('status');
  if (landing) landing.classList.add('hidden');
  if (topbar) topbar.classList.remove('hidden');
  if (mapEl) mapEl.classList.remove('hidden');
  if (status) status.classList.remove('hidden');
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}
