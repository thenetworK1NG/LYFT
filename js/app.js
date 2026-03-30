import {createMap, locateOnce, clearRoute} from './map.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { getDatabase, ref, push, set } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';

const statusEl = document.getElementById('status');
const locateBtn = document.getElementById('locateBtn');
let map = null;
let lastKnownLatLng = null;
let mapClickRegistered = false;
let currentDestination = null;
let currentRouteGeometry = null;

// Firebase config (Realtime Database)
const firebaseConfig = {
  apiKey: "AIzaSyDOK9DF3u9JXzfi7PYExrCDQX09vNN_c3k",
  authDomain: "uber-system-e73d6.firebaseapp.com",
  projectId: "uber-system-e73d6",
  storageBucket: "uber-system-e73d6.firebasestorage.app",
  messagingSenderId: "482805503804",
  appId: "1:482805503804:web:fa126da66cf3efcf45b039",
  measurementId: "G-CC559WX63X",
  databaseURL: "https://uber-system-e73d6-default-rtdb.firebaseio.com/"
};

const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

async function sendLocationToFirebase(latlng) {
  if (!latlng) return;
  try {
    const reqRef = ref(database, 'ride_requests');
    const newReq = push(reqRef);
    await set(newReq, {
      lat: latlng.lat,
      lng: latlng.lng,
      timestamp: Date.now(),
      source: 'book_button'
    });
    setStatus('Location saved to Firebase.');
    showToast('Ride request sent');
    // disable any request controls if present
    const b = document.getElementById('bookBtn');
    if (b) { b.disabled = true; b.textContent = 'Requested ✓'; }
    const f = document.getElementById('fabRequest');
    if (f) { f.disabled = true; f.textContent = 'Requested ✓'; }
  } catch (e) {
    console.error('Firebase write failed', e);
    setStatus('Failed to save location to Firebase.');
  }
}

// Simple toast for confirmations
function showToast(msg, timeout = 2500){
  let t = document.getElementById('__toast');
  if (!t){
    t = document.createElement('div');
    t.id = '__toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  // force a visible style immediately, then clean up after timeout
  t.classList.remove('show');
  // force reflow so transition always triggers
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(()=>{ t.classList.remove('show'); }, timeout);
}

document.addEventListener('DOMContentLoaded', () => {
  // re-query dynamic controls to ensure they exist
  const bookBtn = document.getElementById('bookBtn');
  const fabBtn = document.getElementById('fabRequest');
  // show/hide fab when map is shown
  const showFab = () => { if (fabBtn) fabBtn.classList.remove('hidden'); };
  const hideFab = () => { if (fabBtn) fabBtn.classList.add('hidden'); };
  // Landing flow: user clicks Book to show map and locate quickly.
  if (bookBtn) {
    bookBtn.addEventListener('click', async () => {
      showMapUI(); showFab();
      if (!map) {
        map = createMap('map');
        ensureMapClick();
        // Allow the map container to become visible then refresh tiles
        setTimeout(() => { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); }, 300);
      }
      setStatus('Locating…');
      try {
        const res = await locateOnce(map);
        if (res && res.marker) lastKnownLatLng = res.marker.getLatLng();
        setStatus('Located you on the map.');
        // Do NOT auto-send a ride request here. Wait until user taps destination.
      } catch (err) {
        setStatus('Location error: ' + (err && (err.message || err.code) ? (err.message || err.code) : 'unknown'));
      }
    });
  }

  // Floating FAB request (visible on mobile map view)
  if (fabBtn) {
    fabBtn.addEventListener('click', async () => {
      // use last known or attempt to locate
      if (!lastKnownLatLng) {
        setStatus('Locating…');
        try {
          const res = await locateOnce(map || (map = createMap('map')));
          if (res && res.marker) lastKnownLatLng = res.marker.getLatLng();
          setStatus('Located you on the map.');
        } catch (e) { setStatus('Location error'); }
      }
      // FAB now only recenters/locates; actual ride request is created after tapping destination.
    });
  }

  if (locateBtn) {
    locateBtn.addEventListener('click', async () => {
      if (!map) {
        showMapUI();
        map = createMap('map');
        ensureMapClick();
        setTimeout(() => { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); }, 300);
        // reveal FAB when map visible
        const fb = document.getElementById('fabRequest'); if (fb) fb.classList.remove('hidden');
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
          setTimeout(() => { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); }, 300);
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
      // store destination and route geometry so the user can request based on the route
      currentDestination = to;
      currentRouteGeometry = result.geometry || null;
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
    requestBtn.onclick = async () => {
      if (!lastKnownLatLng || !currentDestination) {
        setStatus('Missing origin or destination.');
        return;
      }
      setStatus('Sending ride request…');
      try {
        const reqRef = ref(database, 'ride_requests');
        const newReq = push(reqRef);
        await set(newReq, {
          origin: { lat: lastKnownLatLng.lat, lng: lastKnownLatLng.lng },
          destination: { lat: currentDestination.lat, lng: currentDestination.lng },
          geometry: currentRouteGeometry || null,
          timestamp: Date.now(),
          source: 'user_map_request'
        });
        showToast('Ride request sent');
        setStatus('Ride requested.');
        // disable the request button to prevent duplicate sends
        requestBtn.disabled = true; requestBtn.textContent = 'Requested ✓';
      } catch (e) {
        console.error('Failed to send ride request', e);
        setStatus('Failed to send request.');
      }
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
  const fab = document.getElementById('fabRequest'); if (fab) fab.classList.remove('hidden');
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}
