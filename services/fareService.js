const calculateDistance = (coord1, coord2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const calculateFare = (service, distance, duration) => {
  const baseFare = service.baseFare;
  const distanceFare = distance * service.perKmRate;
  const timeFare = duration * service.perMinuteRate;
  
  const totalFare = baseFare + distanceFare + timeFare;
  return Math.max(totalFare, service.minimumFare);
};

module.exports = {
  calculateDistance,
  calculateFare
};