// js/map.js
export function createMap(containerId) {
  const map = L.map(containerId, {zoomControl:true}).setView([0,0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  return map;
}

function placeOrUpdate(map, marker, circle, lat, lon, acc) {
  if (!marker) {
    marker = L.marker([lat,lon]).addTo(map).bindPopup('You are here');
    circle = L.circle([lat,lon], {radius: acc}).addTo(map);
    map.setView([lat,lon], 16);
  } else {
    marker.setLatLng([lat,lon]);
    circle.setLatLng([lat,lon]).setRadius(acc);
  }
  return {marker, circle};
}

// locateOnce: fast-first (use cached/quick), then try high-accuracy update.
// If geolocation fails, attempt an IP-based fallback.
export function locateOnce(map, opts = {}) {
  return new Promise(async (resolve, reject) => {
    if (!navigator.geolocation) {
      // try IP fallback
      try {
        const ippos = await fetch('https://ipapi.co/json/').then(r => r.json());
        const lat = parseFloat(ippos.latitude), lon = parseFloat(ippos.longitude);
        const marker = L.marker([lat,lon]).addTo(map).bindPopup('Approximate location (IP)').openPopup();
        const circle = L.circle([lat,lon], {radius: 1000}).addTo(map);
        map.setView([lat,lon], 12);
        return resolve({marker, circle, position: null, fallback: 'ip'});
      } catch (e) {
        return reject(new Error('Geolocation not available'));
      }
    }

    let marker = null, circle = null;

    // Quick attempt: use cached position or a fast low-accuracy fix
    const quickOptions = { enableHighAccuracy: false, timeout: 2000, maximumAge: 60000 };
    const highOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

    let resolved = false;

    const onQuick = (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy || 50;
      ({marker, circle} = placeOrUpdate(map, marker, circle, lat, lon, acc));
      if (!resolved) {
        resolved = true;
        resolve({marker, circle, position: pos, fallback: 'quick'});
      }
    };

    const onQuickErr = async () => {
      // quick failed; fall back to high-accuracy attempt directly
      try {
        navigator.geolocation.getCurrentPosition(onHigh, onHighErr, highOptions);
      } catch (e) {
        // fall back to IP
        try {
          const ippos = await fetch('https://ipapi.co/json/').then(r => r.json());
          const lat = parseFloat(ippos.latitude), lon = parseFloat(ippos.longitude);
          ({marker, circle} = placeOrUpdate(map, marker, circle, lat, lon, 1000));
          map.setView([lat,lon], 12);
          if (!resolved) { resolved = true; resolve({marker, circle, position: null, fallback: 'ip'}); }
        } catch (e2) {
          if (!resolved) { resolved = true; reject(e2); }
        }
      }
    };

    const onHigh = (pos) => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy || 10;
      ({marker, circle} = placeOrUpdate(map, marker, circle, lat, lon, acc));
      if (!resolved) {
        resolved = true;
        resolve({marker, circle, position: pos, fallback: 'high'});
      }
    };

    const onHighErr = async (err) => {
      try {
        const ippos = await fetch('https://ipapi.co/json/').then(r => r.json());
        const lat = parseFloat(ippos.latitude), lon = parseFloat(ippos.longitude);
        ({marker, circle} = placeOrUpdate(map, marker, circle, lat, lon, 1000));
        map.setView([lat,lon], 12);
        if (!resolved) { resolved = true; resolve({marker, circle, position: null, fallback: 'ip'}); }
      } catch (e2) {
        if (!resolved) { resolved = true; reject(err || e2); }
      }
    };

    // Start quick then background high-accuracy
    try {
      navigator.geolocation.getCurrentPosition(onQuick, onQuickErr, quickOptions);
      // also schedule a high-accuracy update in parallel (it may take longer)
      navigator.geolocation.getCurrentPosition(onHigh, onHighErr, highOptions);
    } catch (e) {
      onQuickErr();
    }
  });
}

export function watchPosition(map, onUpdate) {
  if (!navigator.geolocation) return null;
  let marker = null, circle = null;
  const id = navigator.geolocation.watchPosition(pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy || 0;
    if (!marker) {
      marker = L.marker([lat,lon]).addTo(map).bindPopup('You are here');
      circle = L.circle([lat,lon], {radius: acc}).addTo(map);
    } else {
      marker.setLatLng([lat,lon]);
      circle.setLatLng([lat,lon]).setRadius(acc);
    }
    if (typeof onUpdate === 'function') onUpdate({marker,circle,position:pos});
  }, console.error, {enableHighAccuracy:true, maximumAge:0, timeout:10000});
  return () => navigator.geolocation.clearWatch(id);
}

// Route from `from` to `to` using OSRM public server. `from` and `to` are [lat, lon].
// Returns an object: {layer, distance, duration, geometry}
export async function routeTo(map, from, to) {
  if (!from || !to) throw new Error('from and to required');
  const [fLat, fLon] = from;
  const [tLat, tLon] = to;
  const url = `https://router.project-osrm.org/route/v1/driving/${fLon},${fLat};${tLon},${tLat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Routing request failed');
  const data = await res.json();
  if (!data.routes || !data.routes.length) throw new Error('No route found');
  const route = data.routes[0];
  const geo = route.geometry;
  const layer = L.geoJSON(geo, {style: {color: '#007bff', weight: 5, opacity: 0.8}}).addTo(map);
  // fit bounds
  try {
    const bounds = layer.getBounds();
    if (bounds && bounds.isValid()) map.fitBounds(bounds, {padding: [50,50]});
  } catch (e) {
    // ignore
  }
  return {layer, distance: route.distance, duration: route.duration, geometry: geo};
}
