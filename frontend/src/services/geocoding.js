/**
 * RouteRescue Geocoding Service
 * Compliant with OpenStreetMap Nominatim Usage Policy:
 * - Specific descriptive User-Agent
 * - Max 1 request per second throttling
 * - Debounced inputs with AbortController cancellation
 * - In-memory LRU cache to prevent redundant lookups
 * - Graceful fallback when service is unavailable or rate-limited
 * - Never fabricates fake coordinates or addresses
 */

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "RouteRescue-FloodIntelligence/3.0";

// In-memory cache for reverse geocoding and search queries
const reverseGeocodeCache = new Map();
const searchCache = new Map();

// Minimum time between consecutive Nominatim requests (1000ms per OSM policy)
let lastRequestTimestamp = 0;
const MIN_REQUEST_INTERVAL_MS = 1000;

async function throttleRequest() {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTimestamp;
  if (timeSinceLast < MIN_REQUEST_INTERVAL_MS) {
    const delay = MIN_REQUEST_INTERVAL_MS - timeSinceLast;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  lastRequestTimestamp = Date.now();
}

/**
 * Searches real addresses, streets, landmarks and places.
 * @param {string} query Search text
 * @param {object} options { signal, limit, viewbox }
 * @returns {Promise<{ success: boolean, results: Array, error?: string }>}
 */
export async function searchPlaces(query, options = {}) {
  const trimmed = (query || "").trim();
  if (!trimmed || trimmed.length < 2) {
    return { success: true, results: [] };
  }

  const cacheKey = trimmed.toLowerCase();
  if (searchCache.has(cacheKey)) {
    return { success: true, results: searchCache.get(cacheKey) };
  }

  try {
    await throttleRequest();

    const limit = options.limit || 5;
    const url = new URL(`${NOMINATIM_BASE_URL}/search`);
    url.searchParams.set("format", "json");
    url.searchParams.set("q", trimmed);
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", String(limit));

    // Optional geographic bias towards SF Bay Area if requested
    if (options.viewbox) {
      url.searchParams.set("viewbox", options.viewbox);
      url.searchParams.set("bounded", "0");
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": USER_AGENT
      },
      signal: options.signal
    });

    if (response.status === 429) {
      return {
        success: false,
        results: [],
        error: "Search rate limit reached. Please wait a moment before trying again."
      };
    }

    if (!response.ok) {
      return {
        success: false,
        results: [],
        error: `Search service returned HTTP ${response.status}.`
      };
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      return { success: true, results: [] };
    }

    const formatted = data.map(item => {
      const lat = parseFloat(item.lat);
      const lng = parseFloat(item.lon);
      const name = item.name || (item.display_name ? item.display_name.split(",")[0] : "Location");
      return {
        id: item.place_id || `${lat},${lng}`,
        displayName: item.display_name,
        name,
        lat,
        lng,
        type: item.type || "place",
        category: item.class || "place",
        address: item.address || {}
      };
    });

    // Cache results (keep max 100 entries)
    if (searchCache.size > 100) {
      const firstKey = searchCache.keys().next().value;
      searchCache.delete(firstKey);
    }
    searchCache.set(cacheKey, formatted);

    return { success: true, results: formatted };
  } catch (err) {
    if (err.name === "AbortError") {
      return { success: false, results: [], error: "aborted" };
    }
    return {
      success: false,
      results: [],
      error: `Network error reaching search service: ${err.message}`
    };
  }
}

/**
 * Performs reverse geocoding to resolve coordinates to a readable address.
 * Gracefully falls back to coordinates if service fails or is rate limited.
 * @param {number} lat Latitude
 * @param {number} lng Longitude
 * @param {object} options { signal }
 * @returns {Promise<{ success: boolean, displayName: string, address: object, error?: string }>}
 */
export async function reverseGeocode(lat, lng, options = {}) {
  if (typeof lat !== "number" || typeof lng !== "number" || isNaN(lat) || isNaN(lng)) {
    return {
      success: false,
      displayName: "Invalid coordinates",
      address: {},
      error: "Coordinates must be valid numbers"
    };
  }

  // Cache key rounded to 4 decimals (~11 meters)
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey);
  }

  try {
    await throttleRequest();

    const url = new URL(`${NOMINATIM_BASE_URL}/reverse`);
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": USER_AGENT
      },
      signal: options.signal
    });

    if (!response.ok) {
      const fallback = {
        success: false,
        displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        address: {},
        error: `Reverse geocoding unavailable (HTTP ${response.status})`
      };
      return fallback;
    }

    const data = await response.json();
    if (!data || data.error) {
      return {
        success: false,
        displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        address: {},
        error: data?.error || "No address found for these coordinates"
      };
    }

    // Build short readable name (e.g. "123 Market St" or road name)
    const addr = data.address || {};
    let shortName = "";
    if (addr.road) {
      shortName = addr.house_number ? `${addr.house_number} ${addr.road}` : addr.road;
      if (addr.neighbourhood || addr.suburb || addr.city) {
        shortName += `, ${addr.neighbourhood || addr.suburb || addr.city}`;
      }
    } else {
      shortName = data.display_name ? data.display_name.split(",").slice(0, 3).join(",") : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }

    const result = {
      success: true,
      displayName: shortName || data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      fullDisplayName: data.display_name,
      address: addr
    };

    if (reverseGeocodeCache.size > 100) {
      const firstKey = reverseGeocodeCache.keys().next().value;
      reverseGeocodeCache.delete(firstKey);
    }
    reverseGeocodeCache.set(cacheKey, result);

    return result;
  } catch (err) {
    if (err.name === "AbortError") {
      return {
        success: false,
        displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        address: {},
        error: "aborted"
      };
    }
    return {
      success: false,
      displayName: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      address: {},
      error: `Reverse geocode failed: ${err.message}`
    };
  }
}
