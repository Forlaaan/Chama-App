// src/cache.js
// Simple offline read-cache using localStorage

export function cacheSet(key, data) {
  try {
    const cacheEntry = {
      timestamp: Date.now(),
      data: data,
    };
    localStorage.setItem(`chama_cache_${key}`, JSON.stringify(cacheEntry));
  } catch (e) {
    console.error('Cache set failed', e);
  }
}

export function cacheGet(key) {
  try {
    const item = localStorage.getItem(`chama_cache_${key}`);
    if (item) {
      const cacheEntry = JSON.parse(item);
      return cacheEntry.data;
    }
  } catch (e) {
    console.error('Cache get failed', e);
  }
  return null;
}

export function cacheInvalidate(key) {
  try {
    localStorage.removeItem(`chama_cache_${key}`);
  } catch (e) {
    console.error('Cache invalidate failed', e);
  }
}
