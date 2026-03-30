import {createMap, locateOnce, clearRoute} from './map.js';

const statusEl = document.getElementById('status');
const locateBtn = document.getElementById('locateBtn');
const bookBtn = document.getElementById('bookBtn');
let map = null;
let lastKnownLatLng = null;
let mapClickRegistered = false;

document.addEventListener('DOMContentLoaded', () => {
  // Landing flow: user clicks Book to show map and locate quickly.
  if (bookBtn) {
    bookBtn.addEventListener('click', async () => {
      showMapUI();
      if (!map) {
        map = createMap('map');
        ensureMapClick();
      }
      setStatus('Locating…');
      try {
        const res = await locateOnce(map);
        if (res && res.marker) lastKnownLatLng = res.marker.getLatLng();
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
        ensureMapClick();
      }
      setStatus('Locating…');
      try {
        const res = await locateOnce(map);
        if (res && res.marker) lastKnownLatLng = res.marker.getLatLng();
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
        stopWatch = watchPosition(map, (obj) => {
          if (obj && obj.marker) lastKnownLatLng = obj.marker.getLatLng();
          setStatus('Tracking location (click to stop).');
        });
        trackBtn.textContent = 'Stop tracking';
        setStatus('Tracking started.');
      } else {
        stopWatch();
        stopWatch = null;
        trackBtn.textContent = 'Start tracking';
        setStatus('Tracking stopped.');
      }
      ensureMapClick();
    });
  }
});

function ensureMapClick() {
  if (!map || mapClickRegistered) return;
  map.on('click', async (e) => {
    const to = e.latlng;
    if (!lastKnownLatLng) {
      setStatus('No known starting location — please tap "Center on me" first.');
      return;
    }
    setStatus('Routing to destination...');
    try {
      const { routeBetween } = await import('./map.js');
      const result = await routeBetween(map, lastKnownLatLng, to);
      const km = (result.distance / 1000).toFixed(2);
      const mins = Math.round(result.duration / 60);
      showRidePanel(km, mins);
    } catch (err) {
      setStatus('Routing failed: ' + (err && err.message ? err.message : 'unknown'));
    }
  });
  mapClickRegistered = true;
}

function showRidePanel(km, mins) {
  const panel = document.getElementById('ridePanel');
  const distEl = document.getElementById('rideDistance');
  const durEl = document.getElementById('rideDuration');
  const requestBtn = document.getElementById('requestBtn');
  const clearBtn = document.getElementById('clearRouteBtn');
  if (distEl) distEl.textContent = `${km} km`;
  if (durEl) durEl.textContent = `~${mins} min`;
  if (panel) panel.classList.remove('hidden');

  if (requestBtn) {
    requestBtn.onclick = () => {
      setStatus('Ride requested — stub action.');
      // TODO: wire to backend API
    };
  }
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (map) clearRoute(map);
      hideRidePanel();
      setStatus('Route cleared.');
    };
  }
}

function hideRidePanel() {
  const panel = document.getElementById('ridePanel');
  if (panel) panel.classList.add('hidden');
}

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
