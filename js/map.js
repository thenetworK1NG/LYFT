// js/map.js
export function createMap(containerId) {
  const map = L.map(containerId, {zoomControl:true}).setView([0,0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  return map;
}

export function locateOnce(map) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation not supported'));
    navigator.geolocation.getCurrentPosition(pos => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude, acc = pos.coords.accuracy || 0;
      const marker = L.marker([lat,lon]).addTo(map).bindPopup('You are here').openPopup();
      const circle = L.circle([lat,lon], {radius: acc}).addTo(map);
      map.setView([lat,lon], 16);
      resolve({marker,circle,position:pos});
    }, err => reject(err), {enableHighAccuracy:true, timeout:10000, maximumAge:0});
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
