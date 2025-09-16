// API configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://k9j2jjtd5a.execute-api.us-west-2.amazonaws.com/prod';

export const apiConfig = {
  baseUrl: API_BASE_URL,
  endpoints: {
    weekly: `${API_BASE_URL}/weekly`,
    overall: `${API_BASE_URL}/overall`, 
    nflState: `${API_BASE_URL}/nfl-state`,
    pollingStatus: `${API_BASE_URL}/polling/status`,
    pollingToggle: `${API_BASE_URL}/polling/toggle`,
    calculatePlayoffs: `${API_BASE_URL}/calculate-playoffs`,
    syncHistorical: `${API_BASE_URL}/sync-historical`,
    fetchPlayers: `${API_BASE_URL}/players`,
    adminValidate: `${API_BASE_URL}/admin/validate`
  }
};

// Smart caching utility - adjusts based on polling status
const getCacheKey = (url) => `api_cache_${btoa(url)}`;
const POLLING_CACHE_DURATION = 9 * 1000; // 9 seconds when polling is active
const IDLE_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes when polling is inactive

// Check if polling is currently active (with fallback for reliability)
const isPollingActive = async () => {
  try {
    // Try to get polling status from API
    const response = await fetch(`${API_BASE_URL}/polling/status`, {
      method: 'GET',
      timeout: 3000 // Quick timeout for status check
    });
    if (response.ok) {
      const data = await response.json();
      return data.enabled === true;
    }
  } catch (error) {
    console.log('Could not fetch polling status, using fallback');
  }
  
  // Fallback: assume polling is active during typical game hours
  // This prevents cache issues if polling status API is unreliable
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Assume polling is active during NFL game times:
  // Sunday: 10 AM - 11 PM (games typically run 1 PM - 8 PM ET, but data updates before/after)
  // Monday/Thursday: 6 PM - 11 PM (primetime games)
  // Saturday: 4 PM - 11 PM (playoff games)
  if (day === 0) { // Sunday
    return hour >= 10 && hour <= 23;
  } else if (day === 1 || day === 4) { // Monday/Thursday
    return hour >= 18 && hour <= 23;
  } else if (day === 6) { // Saturday (playoffs)
    return hour >= 16 && hour <= 23;
  }
  
  return false; // Default to inactive during other times
};

const getCachedData = async (url) => {
  try {
    const cacheKey = getCacheKey(url);
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { data, timestamp, cacheDuration } = JSON.parse(cached);
      const currentCacheDuration = cacheDuration || IDLE_CACHE_DURATION;
      
      if (Date.now() - timestamp < currentCacheDuration) {
        console.log('Using cached data for:', url);
        return data;
      }
    }
  } catch (error) {
    console.warn('Cache read error:', error);
  }
  return null;
};

const setCachedData = (url, data, cacheDuration) => {
  try {
    const cacheKey = getCacheKey(url);
    const cacheData = {
      data,
      timestamp: Date.now(),
      cacheDuration
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`Cached data for: ${url} (duration: ${cacheDuration}ms)`);
  } catch (error) {
    console.warn('Cache write error:', error);
  }
};

// API helper functions with smart caching based on polling status
export const apiCall = async (url, options = {}) => {
  const timeout = options.timeout || 10000; // 10 second default timeout
  const maxRetries = options.maxRetries || 2;
  const retryDelay = options.retryDelay || 1000;
  const useCache = options.useCache !== false; // Default to true for PWA

  // Determine cache duration based on polling status
  const pollingActive = await isPollingActive();
  const cacheDuration = pollingActive ? POLLING_CACHE_DURATION : IDLE_CACHE_DURATION;
  
  console.log(`Polling active: ${pollingActive}, using ${cacheDuration}ms cache for: ${url}`);

  // Check cache first for PWA optimization
  if (useCache && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
    const cachedData = await getCachedData(url);
    if (cachedData) {
      return cachedData;
    }
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        signal: controller.signal,
        ...options
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Cache successful responses with smart duration
      if (useCache && response.ok && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
        setCachedData(url, data, cacheDuration);
      }

      return data;
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = !error.status;

      console.warn(`API call attempt ${attempt + 1} failed:`, error.message);

      if (isLastAttempt) {
        // For PWA: try to return cached data as fallback on final failure
        if (useCache && options.method !== 'POST' && options.method !== 'PUT' && options.method !== 'DELETE') {
          const cachedData = await getCachedData(url);
          if (cachedData) {
            console.log('Using stale cached data as fallback for:', url);
            return cachedData;
          }
        }
        throw new Error(`API call failed after ${maxRetries + 1} attempts: ${error.message}`);
      }

      // Only retry on network errors or timeouts, not on HTTP errors
      if (isTimeout || isNetworkError) {
        console.log(`Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        throw error; // Don't retry HTTP errors
      }
    }
  }
};

export const adminApiCall = async (url, options = {}) => {
  const adminApiKey = localStorage.getItem('adminApiKey');
  
  return apiCall(url, {
    ...options,
    headers: {
      'X-Admin-Key': adminApiKey,
      ...options.headers
    }
  });
};
