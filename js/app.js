import {createMap, locateOnce, clearRoute} from './map.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js';
import { getDatabase, ref, push, set, onValue, get } from 'https://www.gstatic.com/firebasejs/9.22.1/firebase-database.js';

const statusEl = document.getElementById('status');
const locateBtn = document.getElementById('locateBtn');
let map = null;
let lastKnownLatLng = null;
let mapClickRegistered = false;
let currentDestination = null;
let currentRouteGeometry = null;
let myRequestId = null;
let myRequestUnsub = null;
let myDriverUnsub = null;

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
  t.classList.remove('show');
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(()=>{ t.classList.remove('show'); }, timeout);
}

document.addEventListener('DOMContentLoaded', () => {
  const bookBtn = document.getElementById('bookBtn');

  // Landing flow: user clicks "Find my location" to show map
  if (bookBtn) {
    bookBtn.addEventListener('click', async () => {
      showMapUI();
      if (!map) {
        map = createMap('map');
        ensureMapClick();
        setTimeout(() => { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); }, 300);
      }
      setStatus('Locating…');
      try {
        const res = await locateOnce(map);
        if (res && res.marker) lastKnownLatLng = res.marker.getLatLng();
        setStatus('Located you on the map. Tap the map to choose a destination.');
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
        setTimeout(() => { if (map && typeof map.invalidateSize === 'function') map.invalidateSize(); }, 300);
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
});

function ensureMapClick() {
  if (!map || mapClickRegistered) return;
  map.on('click', async (e) => {
    const to = e.latlng;
    if (!lastKnownLatLng) {
      setStatus('No known starting location — please tap "Center on me" first.');
      return;
    }
    setStatus('Routing to destination…');
    // Hide the hint banner once the user taps
    const hint = document.getElementById('mapHint');
    if (hint) hint.classList.add('hidden');
    try {
      const { routeBetween } = await import('./map.js');
      const result = await routeBetween(map, lastKnownLatLng, to);
      currentDestination = to;
      currentRouteGeometry = result.geometry || null;
      const km = (result.distance / 1000).toFixed(2);
      const mins = Math.round(result.duration / 60);
      showRidePanel(km, mins);
      setStatus(`Route: ${km} km · ~${mins} min`);
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
        myRequestId = newReq.key;
        try{ localStorage.setItem('myRequestId', myRequestId); }catch(e){}
        attachRequestListener(myRequestId);
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

function distanceMeters(a, b){
  if(!a || !b) return Infinity;
  const toRad = d => d * Math.PI / 180;
  const R = 6371e3;
  const phi1 = toRad(a.lat), phi2 = toRad(b.lat);
  const dphi = toRad(b.lat - a.lat), dlambda = toRad(b.lng - a.lng);
  const x = Math.sin(dphi/2) * Math.sin(dphi/2) + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)*Math.sin(dlambda/2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
  return R * c;
}

function estimateMinutesFromMeters(m){
  if (!isFinite(m)) return null;
  const metersPerMin = 700; // ~42 km/h average
  return Math.max(1, Math.round(m / metersPerMin));
}

function ensureRideStatusEl(){
  let el = document.getElementById('rideStatus');
  const panel = document.getElementById('ridePanel');
  if (!panel) return null;
  if (!el){
    el = document.createElement('div'); el.id = 'rideStatus'; el.style.marginTop = '8px'; el.style.fontSize = '14px'; el.style.color = '#0b63d6';
    panel.appendChild(el);
  }
  return el;
}

function attachRequestListener(requestId){
  if (!requestId) return;
  const rRef = ref(database, 'ride_requests/' + requestId);
  // detach previous
  try{ if (myRequestUnsub) myRequestUnsub(); }catch(e){}
  myRequestUnsub = onValue(rRef, async (snap) => {
    const data = snap.val();
    const statusEl = ensureRideStatusEl();
    if (!data) {
      // request removed (likely completed by driver) — clear UI immediately
      try{ localStorage.removeItem('myRequestId'); }catch(e){}
      try{ if (myDriverUnsub) myDriverUnsub(); }catch(e){}
      // remove status element if present
      const rs = document.getElementById('rideStatus'); if (rs) rs.remove();
      hideRidePanel();
      showToast('Ride completed');
      return;
    }
    if (data.status === 'completed'){
      try{ localStorage.removeItem('myRequestId'); }catch(e){}
      try{ if (myDriverUnsub) myDriverUnsub(); }catch(e){}
      const rs = document.getElementById('rideStatus'); if (rs) rs.remove();
      hideRidePanel();
      showToast('Ride completed');
      return;
    }
    if (data.acceptedBy) {
      // show driver ETA — fetch driver location and subscribe to updates
      const driverId = data.acceptedBy;
      if (statusEl) statusEl.textContent = 'Driver assigned — calculating ETA…';
      // detach previous driver listener
      try{ if (myDriverUnsub) myDriverUnsub(); }catch(e){}
      const dRef = ref(database, 'drivers/' + driverId);
      myDriverUnsub = onValue(dRef, (dSnap) => {
        const dv = dSnap.val() || {};
        const driverPos = (typeof dv.lat === 'number' && typeof dv.lng === 'number') ? { lat: dv.lat, lng: dv.lng } : null;
        // prefer pickup origin if available
        const origin = data.origin ? { lat: data.origin.lat, lng: data.origin.lng } : (data.lat ? { lat: data.lat, lng: data.lng } : null);
        if (driverPos && origin) {
          const meters = distanceMeters(driverPos, origin);
          const mins = estimateMinutesFromMeters(meters);
          if (statusEl) statusEl.textContent = `Driver is on the way — ETA ~${mins} min`;
        } else if (statusEl) {
          statusEl.textContent = 'Driver is on the way';
        }
      });
    } else {
      if (statusEl) statusEl.textContent = 'Waiting for a driver to accept your request';
    }
  });
}

// attach listener on load if we have an outstanding request
try{ const saved = localStorage.getItem('myRequestId'); if (saved) { myRequestId = saved; attachRequestListener(saved); } }catch(e){}

function hideRidePanel() {
  const panel = document.getElementById('ridePanel');
  if (panel) panel.classList.add('hidden');
}

function showMapUI() {
  const landing = document.getElementById('landing');
  const topbar = document.getElementById('topbar');
  const mapEl = document.getElementById('map');
  const status = document.getElementById('status');
  const hint = document.getElementById('mapHint');
  if (landing) landing.classList.add('hidden');
  if (topbar) topbar.classList.remove('hidden');
  if (hint) hint.classList.remove('hidden');
  if (mapEl) mapEl.classList.remove('hidden');
  if (status) status.classList.remove('hidden');
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}
