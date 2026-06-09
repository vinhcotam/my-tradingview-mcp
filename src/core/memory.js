/**
 * Memory Palace integration for context optimization.
 * Provides cryptographically signed visual memory for AI agents.
 */
import { saveMemory, listMemories, recoverMemory } from 'mempalace';

const MEMORY_CONFIG = {
  // Enable memory palace for context caching
  enabled: process.env.MEMORY_PALACE_ENABLED !== 'false',
  // Max memories to keep in cache
  maxMemories: parseInt(process.env.MEMORY_PALACE_MAX || '10', 10),
  // TTL for memory cache (in seconds)
  ttlSeconds: parseInt(process.env.MEMORY_PALACE_TTL || '300', 10),
};

// In-memory cache for recent memories
const memoryCache = new Map();
let lastCleanup = Date.now();

/**
 * Save execution context to Memory Palace
 * @param {string} toolName - Name of the tool being executed
 * @param {object} context - Context data to save
 * @returns {Promise<string|null>} Short ID or null if failed
 */
export async function saveContext(toolName, context) {
  if (!MEMORY_CONFIG.enabled) return null;
  
  try {
    const memoryData = {
      tool: toolName,
      timestamp: Date.now(),
      context,
    };
    
    const shortId = await saveMemory(memoryData);
    
    // Cache the result
    memoryCache.set(shortId, {
      data: memoryData,
      expires: Date.now() + (MEMORY_CONFIG.ttlSeconds * 1000),
    });
    
    // Cleanup old entries
    cleanupCache();
    
    return shortId;
  } catch (error) {
    console.error('[MemoryPalace] Failed to save context:', error.message);
    return null;
  }
}

/**
 * Recover context from Memory Palace
 * @param {string} shortId - Short ID of the memory to recover
 * @returns {Promise<object|null>} Context data or null if not found
 */
export async function recoverContext(shortId) {
  if (!MEMORY_CONFIG.enabled || !shortId) return null;
  
  // Check cache first
  const cached = memoryCache.get(shortId);
  if (cached && cached.expires > Date.now()) {
    return cached.data.context;
  }
  
  try {
    const memoryData = await recoverMemory(shortId);
    
    // Update cache
    if (memoryData) {
      memoryCache.set(shortId, {
        data: memoryData,
        expires: Date.now() + (MEMORY_CONFIG.ttlSeconds * 1000),
      });
      return memoryData.context;
    }
    
    return null;
  } catch (error) {
    console.error('[MemoryPalace] Failed to recover context:', error.message);
    return null;
  }
}

/**
 * List recent memories
 * @param {number} limit - Number of memories to return
 * @returns {Promise<Array>} List of recent memories
 */
export async function listRecentMemories(limit = MEMORY_CONFIG.maxMemories) {
  if (!MEMORY_CONFIG.enabled) return [];
  
  try {
    const memories = await listMemories(limit);
    return memories || [];
  } catch (error) {
    console.error('[MemoryPalace] Failed to list memories:', error.message);
    return [];
  }
}

/**
 * Cleanup expired cache entries
 */
function cleanupCache() {
  const now = Date.now();
  const cleanupThreshold = 60000; // Cleanup every minute
  
  if (now - lastCleanup < cleanupThreshold) return;
  
  for (const [key, value] of memoryCache.entries()) {
    if (value.expires < now) {
      memoryCache.delete(key);
    }
  }
  
  // Also limit cache size
  if (memoryCache.size > MEMORY_CONFIG.maxMemories * 2) {
    const entries = Array.from(memoryCache.entries())
      .sort((a, b) => a[1].expires - b[1].expires);
    
    const toDelete = entries.slice(0, entries.length - MEMORY_CONFIG.maxMemories);
    for (const [key] of toDelete) {
      memoryCache.delete(key);
    }
  }
  
  lastCleanup = now;
}

/**
 * Get cache statistics
 * @returns {object} Cache stats
 */
export function getCacheStats() {
  const now = Date.now();
  let validCount = 0;
  let expiredCount = 0;
  
  for (const value of memoryCache.values()) {
    if (value.expires > now) {
      validCount++;
    } else {
      expiredCount++;
    }
  }
  
  return {
    total: memoryCache.size,
    valid: validCount,
    expired: expiredCount,
    enabled: MEMORY_CONFIG.enabled,
    maxMemories: MEMORY_CONFIG.maxMemories,
    ttlSeconds: MEMORY_CONFIG.ttlSeconds,
  };
}

export default {
  saveContext,
  recoverContext,
  listRecentMemories,
  getCacheStats,
  MEMORY_CONFIG,
};
