import { searchPlaces, reverseGeocode } from './src/services/geocoding.js';
import { calculateRealRoadRoute } from './src/services/routing.js';

async function runSprint3Validation() {
  console.log('=== ROUTERESCUE SPRINT 3 AUTOMATED SERVICE VERIFICATION ===\n');

  // Test 1: Real-World Place Search (Nominatim)
  console.log('1. Testing Address Search ("Market Street San Francisco")...');
  const searchRes = await searchPlaces('Market Street San Francisco', { limit: 3 });
  console.log('Search Success:', searchRes.success);
  console.log('Search Error:', searchRes.error);
  console.log('Found Results count:', searchRes.results?.length);
  if (searchRes.results && searchRes.results.length > 0) {
    console.log('Top Result:', searchRes.results[0].displayName, `(${searchRes.results[0].lat}, ${searchRes.results[0].lng})`);
  }
  if (!searchRes.success || searchRes.results.length === 0) {
    throw new Error('Geocoding search failed');
  }

  // Test 2: Reverse Geocoding
  console.log('\n2. Testing Reverse Geocoding (37.7749, -122.4194)...');
  const reverseRes = await reverseGeocode(37.7749, -122.4194);
  console.log('Reverse Success:', reverseRes.success);
  console.log('Resolved Address:', reverseRes.displayName);
  if (!reverseRes.success) {
    throw new Error('Reverse geocoding failed');
  }

  // Test 3: Real Road Routing with Hazard Evaluation (OSRM)
  console.log('\n3. Testing Road Routing between Civic Center and Ferry Building with Hazards...');
  const origin = { lat: 37.7753, lng: -122.4194, name: 'Civic Center' };
  const destination = { lat: 37.7955, lng: -122.3937, name: 'Ferry Building' };
  
  // Synthetic / Demo hazards
  const incidents = [
    {
      id: 'HAZ-TEST-1',
      title: 'Confirmed Severe Street Flooding',
      latitude: 37.7800,
      longitude: -122.4100,
      water_depth_inches: 18.0,
      confidence_score: 0.95,
      verification_status: 'CONFIRMED'
    },
    {
      id: 'HAZ-TEST-2',
      title: 'Unverified Water Ponding',
      latitude: 37.7850,
      longitude: -122.4050,
      water_depth_inches: 8.0,
      confidence_score: 0.60,
      verification_status: 'UNVERIFIED'
    }
  ];

  const routeRes = await calculateRealRoadRoute({
    origin,
    destination,
    mode: 'AVOID_CONFIRMED_CLOSURES',
    incidents
  });

  console.log('Route Success:', routeRes.success);
  if (!routeRes.success) {
    throw new Error(`Road routing failed: ${routeRes.error}`);
  }
  console.log('Route ID:', routeRes.data.route_id);
  console.log('Distance:', routeRes.data.total_distance_km.toFixed(2), 'km');
  console.log('Duration:', routeRes.data.total_travel_time_minutes.toFixed(1), 'mins');
  console.log('Waypoints/Coordinates Count:', routeRes.data.coordinates?.length);
  console.log('Avoided Hazards:', routeRes.data.avoided_hazards?.length);
  console.log('Cautions:', routeRes.data.cautions?.length);
  console.log('Routing Engine:', routeRes.data.routing_engine);
  console.log('Safety Disclaimer:', routeRes.data.safety_disclaimer);
  console.log('Route Change Explanation:', routeRes.data.route_change_explanation);

  // Test 4: Coordinate Bounds Validation & Edge Coordinates Handling
  console.log('\n4. Testing Invalid Coordinates Handling...');
  const edgeRes = await calculateRealRoadRoute({
    origin: { lat: 999.0, lng: 0.0 },
    destination: { lat: 37.7955, lng: -122.3937 },
    incidents: []
  });
  console.log('Invalid Lat Handled gracefully:', edgeRes.success === false, 'Error message:', edgeRes.error);

  console.log('\n=== ALL SPRINT 3 SERVICE TESTS COMPLETED SUCCESSFULLY ===');
}

runSprint3Validation().catch(err => {
  console.error('Validation test error:', err);
  process.exit(1);
});
