import {createMap, locateOnce, watchPosition} from './map.js';

let statusEl = null;
let locateBtn = null;
let trackBtn = null;
let stopWatch = null;

document.addEventListener('DOMContentLoaded', async () => {
  statusEl = document.getElementById('status');
  locateBtn = document.getElementById('locateBtn');
  trackBtn = document.getElementById('trackBtn');

  const map = createMap('map');
  setStatus('Map ready. Click "Center on me" to locate.');

  if (locateBtn) {
    locateBtn.addEventListener('click', async () => {
      setStatus('Locating…');
      try {
        await locateOnce(map);
        setStatus('Located you on the map.');
      } catch (err) {
        setStatus('Location error: ' + (err.message || err.code || 'unknown'));
      }
    });
  }

  if (trackBtn) {
    trackBtn.addEventListener('click', () => {
      if (!stopWatch) {
        stopWatch = watchPosition(map, () => setStatus('Tracking location (click to stop).'));
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
});

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}
