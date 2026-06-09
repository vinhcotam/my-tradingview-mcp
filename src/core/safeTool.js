/**
 * Safe tool wrapper for consistent error handling across all MCP tools.
 * Reduces boilerplate and ensures uniform response format.
 */

import { jsonResult } from '../tools/_format.js';

/**
 * Wrap a tool handler function with standardized error handling.
 * @param {Function} handler - Async function that returns plain object (not MCP format)
 * @returns {Function} Wrapped handler returning MCP-compatible response
 */
export function safeTool(handler) {
  return async (params) => {
    try {
      const result = await handler(params);
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
