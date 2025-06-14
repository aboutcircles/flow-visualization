const CACHE_PREFIX = 'circles_viz_';
const DEFAULT_TTL = 3600000; // 1 hour in milliseconds
const PROFILE_TTL = 86400000; // 24 hours for profiles
const TOKEN_INFO_TTL = 3600000; // 1 hour for token info

class CacheService {
  constructor() {
    this.memoryCache = new Map();
    // Keep track of cache version to invalidate on app updates
    this.cacheVersion = '1.0.0';
    this.initCache();
  }

  initCache() {
    const storedVersion = localStorage.getItem(CACHE_PREFIX + 'version');
    if (storedVersion !== this.cacheVersion) {
      this.clearAll();
      localStorage.setItem(CACHE_PREFIX + 'version', this.cacheVersion);
    }
  }

  // Generate cache key
  getCacheKey(type, identifier) {
    return `${CACHE_PREFIX}${type}_${identifier}`;
  }

  // Get from cache (memory first, then localStorage)
  get(type, identifier) {
    const key = this.getCacheKey(type, identifier);
    
    // Check memory cache first
    const memoryItem = this.memoryCache.get(key);
    if (memoryItem && memoryItem.expiry > Date.now()) {
      return memoryItem.data;
    }
    
    // Check localStorage
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.expiry > Date.now()) {
          // Restore to memory cache
          this.memoryCache.set(key, parsed);
          return parsed.data;
        } else {
          // Expired, remove it
          localStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Cache retrieval error:', error);
    }
    
    return null;
  }

  // Set cache item
  set(type, identifier, data, ttl = DEFAULT_TTL) {
    const key = this.getCacheKey(type, identifier);
    const cacheItem = {
      data,
      expiry: Date.now() + ttl,
      version: this.cacheVersion
    };
    
    // Set in memory
    this.memoryCache.set(key, cacheItem);
    
    // Try to set in localStorage
    try {
      localStorage.setItem(key, JSON.stringify(cacheItem));
    } catch (error) {
      // Handle quota exceeded or other errors
      console.warn('localStorage write failed:', error);
      this.clearOldestItems();
      // Try once more after clearing
      try {
        localStorage.setItem(key, JSON.stringify(cacheItem));
      } catch (e) {
        // Give up on localStorage, keep in memory only
        console.warn('localStorage write failed after cleanup:', e);
      }
    }
  }

  // Batch get
  getBatch(type, identifiers) {
    const results = {};
    const missing = [];
    
    identifiers.forEach(id => {
      const cached = this.get(type, id);
      if (cached) {
        results[id] = cached;
      } else {
        missing.push(id);
      }
    });
    
    return { results, missing };
  }

  // Batch set
  setBatch(type, items, ttl = DEFAULT_TTL) {
    Object.entries(items).forEach(([id, data]) => {
      this.set(type, id, data, ttl);
    });
  }

  // Get TTL by type
  getTTLByType(type) {
    switch(type) {
      case 'profile':
        return PROFILE_TTL;
      case 'tokenInfo':
        return TOKEN_INFO_TTL;
      default:
        return DEFAULT_TTL;
    }
  }

  // Clear old items when storage is full
  clearOldestItems() {
    const items = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + 'version') {
        try {
          const item = JSON.parse(localStorage.getItem(key));
          items.push({ key, expiry: item.expiry });
        } catch (e) {
          // Invalid item, remove it
          localStorage.removeItem(key);
        }
      }
    }
    
    // Sort by expiry and remove oldest 25%
    items.sort((a, b) => a.expiry - b.expiry);
    const toRemove = Math.ceil(items.length * 0.25);
    items.slice(0, toRemove).forEach(item => {
      localStorage.removeItem(item.key);
      this.memoryCache.delete(item.key);
    });
  }

  // Clear all cache
  clearAll() {
    // Clear memory cache
    this.memoryCache.clear();
    
    // Clear localStorage
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + 'version') {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }

  // Get cache statistics
  getStats() {
    let localStorageCount = 0;
    let localStorageSize = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) {
        localStorageCount++;
        const item = localStorage.getItem(key);
        localStorageSize += item ? item.length : 0;
      }
    }
    
    return {
      memoryCount: this.memoryCache.size,
      localStorageCount,
      localStorageSize: (localStorageSize / 1024).toFixed(2) + ' KB'
    };
  }
}

export default new CacheService();