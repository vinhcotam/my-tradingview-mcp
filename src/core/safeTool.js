/**
 * Safe tool wrapper for consistent error handling across all MCP tools.
 * Reduces boilerplate and ensures uniform response format.
 */

import { jsonResult } from '../tools/_format.js';
import { saveContext, recoverContext, getCacheStats } from './memory.js';

/**
 * Wrap a tool handler function with standardized error handling.
 * @param {Function} handler - Async function that returns plain object (not MCP format)
 * @returns {Function} Wrapped handler returning MCP-compatible response
 */
export function safeTool(handler) {
  return async (params) => {
    try {
      const result = await handler(params);
      
      // Save context to Memory Palace for future reference
      if (result && typeof result === 'object') {
        const memoryId = await saveContext(handler.name || 'unknown', {
          params,
          result: sanitizeForMemory(result),
          timestamp: Date.now(),
        });
        if (memoryId) {
          result.memory_id = memoryId;
        }
      }
      
      return jsonResult(result);
    } catch (err) {
      return jsonResult({ success: false, error: err.message }, true);
    }
  };
}

/**
 * Wrap a tool handler with error handling and custom error metadata.
 * @param {Function} handler - Async function returning plain object
 * @param {Object} options - Options for error customization
 * @param {string} [options.errorHint] - Additional hint to include in errors
 * @param {boolean} [options.includeParams=false] - Include params in error response for debugging
 * @returns {Function} Wrapped handler
 */
export function safeToolWithMeta(handler, options = {}) {
  return async (params) => {
    try {
      const result = await handler(params);
      
      // Save context to Memory Palace
      if (result && typeof result === 'object') {
        const memoryId = await saveContext(handler.name || 'unknown', {
          params,
          result: sanitizeForMemory(result),
          timestamp: Date.now(),
        });
        if (memoryId) {
          result.memory_id = memoryId;
        }
      }
      
      return jsonResult(result);
    } catch (err) {
      const errorResponse = { 
        success: false, 
        error: err.message,
        ...(options.errorHint && { hint: options.errorHint })
      };
      if (options.includeParams) {
        errorResponse.params = params;
      }
      return jsonResult(errorResponse, true);
    }
  };
}

/**
 * Sanitize data for storage in Memory Palace (remove large arrays, circular refs, etc.)
 * @param {any} data - Data to sanitize
 * @returns {any} Sanitized data
 */
function sanitizeForMemory(data) {
  if (!data || typeof data !== 'object') return data;
  
  const seen = new WeakSet();
  
  function sanitize(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return '[Circular Reference]';
    seen.add(obj);
    
    if (Array.isArray(obj)) {
      // Limit array size for memory efficiency
      if (obj.length > 50) {
        return { _truncated: true, count: obj.length, sample: obj.slice(0, 10).map(sanitize) };
      }
      return obj.map(sanitize);
    }
    
    const result = {};
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      
      // Skip large binary data, functions, undefined
      if (typeof value === 'function' || value === undefined) continue;
      
      // Truncate long strings
      if (typeof value === 'string' && value.length > 500) {
        result[key] = value.substring(0, 500) + '...[truncated]';
        continue;
      }
      
      // Recursively sanitize objects
      if (typeof value === 'object') {
        result[key] = sanitize(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  return sanitize(data);
}

/**
 * Get Memory Palace cache statistics
 * @returns {Object} Cache stats
 */
export function getMemoryStats() {
  return getCacheStats();
}
