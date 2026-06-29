// ============================================================
//  synapse-client/src/utils/coordinateHelper.js
//
//  Failsafe utility to extract coordinates from any AI-returned
//  node object. The AI can respond with varying JSON shapes:
//    1. Nested object:  `node.position = { x, y, z }`
//    2. Nested array:   `node.position = [ x, y, z ]`
//    3. Flat structure: `node.x`, `node.y`, `node.z` directly on node
//  This utility normalises all variations into a clean { x, y, z }
//  object with numeric fallbacks to prevent WebGL NaN crashes.
// ============================================================

/**
 * Safely extracts X, Y, Z coordinates from a node object.
 *
 * @param {Object} node - The node object from the API response
 * @returns {{ x: number, y: number, z: number }}
 */
export const getSafePosition = (node) => {
  let x = 0;
  let y = 0;
  let z = 0;

  if (!node) {
    return { x, y, z };
  }

  // 1. Nested position object or array
  if (node.position !== undefined && node.position !== null) {
    if (Array.isArray(node.position)) {
      x = Number(node.position[0]);
      y = Number(node.position[1]);
      z = Number(node.position[2]);
    } else if (typeof node.position === "object") {
      x = Number(node.position.x);
      y = Number(node.position.y);
      z = Number(node.position.z);
    }
  } 
  // 2. Flat structure (x, y, z direct properties)
  else {
    if (node.x !== undefined) x = Number(node.x);
    if (node.y !== undefined) y = Number(node.y);
    if (node.z !== undefined) z = Number(node.z);
  }

  // 3. Coordinate validation - ensure they are finite numbers, otherwise fallback to 0
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    z: Number.isFinite(z) ? z : 0,
  };
};
