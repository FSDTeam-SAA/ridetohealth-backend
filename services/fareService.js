// const calculateDistance = (coord1, coord2) => {
//   console.log('Calculating distance between:', coord1, coord2);
//   const R = 6371; // Earth's radius in kilometers
//   const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
//   const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
//   const a = 
//     Math.sin(dLat/2) * Math.sin(dLat/2) +
//     Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) * 
//     Math.sin(dLon/2) * Math.sin(dLon/2);
//   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
//   return R * c;
// };

const calculateFare = (service, distance, duration) => {
  const baseFare = service.baseFare;
  const distanceFare = distance * service.perKmRate;
  const timeFare = duration * service.perMinuteRate;
  
  const totalFare = baseFare + distanceFare + timeFare;
  return Math.max(totalFare, service.minimumFare);
};

// Haversine distance calculation
const calculateDistance = (coords1, coords2) => {
  const [lng1, lat1] = coords1;
  const [lng2, lat2] = coords2;
  
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100;
};

// Coordinate validation
const isValidCoordinate = (lat, lng) => {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
};

// Rate limiting for location updates
const locationUpdateLimiter = new Map();
const RATE_LIMIT_MS = 2000; // 2 seconds

module.exports = {
  calculateDistance,
  calculateFare,
  isValidCoordinate
};