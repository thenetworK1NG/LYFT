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
        setStatus('Tap the map to choose your destination');
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
        setStatus('Location updated');
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
      setStatus('Tap the locate button first');
      return;
    }
    setStatus('Routing…');
    const hint = document.getElementById('mapHint');
    if (hint) hint.classList.add('hidden');
    try {
      const { routeBetween } = await import('./map.js');
      const result = await routeBetween(map, lastKnownLatLng, to);
      currentDestination = to;
      currentRouteGeometry = result.geometry || null;
      const km = (result.distance / 1000).toFixed(1);
      const mins = Math.round(result.duration / 60);
      showRidePanel(km, mins);
      setStatus(`${km} km · ~${mins} min`);
    } catch (err) {
      setStatus('Routing failed');
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
  if (distEl) distEl.textContent = km;
  if (durEl) durEl.textContent = `~${mins}`;
  if (panel) panel.classList.remove('hidden');

  if (requestBtn) {
    requestBtn.onclick = async () => {
      if (!lastKnownLatLng || !currentDestination) {
        setStatus('Missing origin or destination');
        return;
      }
      setStatus('Sending request…');
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
        showToast('Ride requested!');
        setStatus('Looking for a driver…');
        requestBtn.disabled = true;
        requestBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Requested';
      } catch (e) {
        console.error('Failed to send ride request', e);
        setStatus('Failed to send request');
      }
    };
  }
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (map) clearRoute(map);
      hideRidePanel();
      setStatus('Route cleared');
      // Show hint again
      const hint = document.getElementById('mapHint');
      if (hint) hint.classList.remove('hidden');
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
  const metersPerMin = 700;
  return Math.max(1, Math.round(m / metersPerMin));
}

function updateRideStatus(text) {
  const el = document.getElementById('rideStatus');
  if (el) el.textContent = text || '';
}

function attachRequestListener(requestId){
  if (!requestId) return;
  const rRef = ref(database, 'ride_requests/' + requestId);
  try{ if (myRequestUnsub) myRequestUnsub(); }catch(e){}
  myRequestUnsub = onValue(rRef, async (snap) => {
    const data = snap.val();
    if (!data) {
      try{ localStorage.removeItem('myRequestId'); }catch(e){}
      try{ if (myDriverUnsub) myDriverUnsub(); }catch(e){}
      updateRideStatus('');
      hideRidePanel();
      showToast('Ride completed!');
      return;
    }
    if (data.status === 'completed'){
      try{ localStorage.removeItem('myRequestId'); }catch(e){}
      try{ if (myDriverUnsub) myDriverUnsub(); }catch(e){}
      updateRideStatus('');
      hideRidePanel();
      showToast('Ride completed!');
      return;
    }
    if (data.acceptedBy) {
      const driverId = data.acceptedBy;
      updateRideStatus('Driver on the way…');
      try{ if (myDriverUnsub) myDriverUnsub(); }catch(e){}
      const dRef = ref(database, 'drivers/' + driverId);
      myDriverUnsub = onValue(dRef, (dSnap) => {
        const dv = dSnap.val() || {};
        const driverPos = (typeof dv.lat === 'number' && typeof dv.lng === 'number') ? { lat: dv.lat, lng: dv.lng } : null;
        const origin = data.origin ? { lat: data.origin.lat, lng: data.origin.lng } : (data.lat ? { lat: data.lat, lng: data.lng } : null);
        if (driverPos && origin) {
          const meters = distanceMeters(driverPos, origin);
          const mins = estimateMinutesFromMeters(meters);
          updateRideStatus(`Driver arriving in ~${mins} min`);
        } else {
          updateRideStatus('Driver on the way');
        }
      });
    } else {
      updateRideStatus('Searching for a driver…');
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
  const mapEl = document.getElementById('map');
  const status = document.getElementById('status');
  const hint = document.getElementById('mapHint');
  const locBtn = document.getElementById('locateBtn');
  if (landing) landing.classList.add('hidden');
  if (hint) hint.classList.remove('hidden');
  if (mapEl) mapEl.classList.remove('hidden');
  if (status) status.classList.remove('hidden');
  if (locBtn) locBtn.classList.remove('hidden');
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}
