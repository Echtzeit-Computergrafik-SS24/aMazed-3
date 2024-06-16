import { Vec3 } from "../glance/js/math/index.js";
export { insetFaces };

/// Inset specified faces of a cube by cubeSize/numberOfSegments
/// @param {Object} cube - Object containing the positions, indices, texCoords and normals of the cube
/// @param {number} numberOfSegments - Number of segments of the cube
/// @param {number} cubeSize - Size of the cube
/// @param {Array} facesToInset - Array containing the faces to inset
/// @returns {Object} - Object containing the positions, indices, texCoords and normals of the inset cube
function insetFaces(cube, numberOfSegments, cubeSize, facesToInset) {
  // Initialize variables
  const { positions, indices, texCoords, normals } = cube;
  const insetDepth = cubeSize / numberOfSegments;
  const originalVerticesArray = [];
  const insetVerticesArray = [];
  const indexTuples = [];
  const edgeWalls = [];

  // Get triangle indices from array of faces to be inset
  const triangleIndices = getTriangleIndices();

  // Inset the faces
  for (let i = 0; i < triangleIndices.length; i++) {
    insetTriangle(triangleIndices[i]);
  }

  // Create walls at the edge of the inset faces
  for (let i = 0; i < indices.length; i += 3) {
    indexTuples.push([indices[i], indices[i + 1], indices[i + 2]]);
  }

  for (let i = 0; i < insetVerticesArray.length; i++) {
    createWalls(originalVerticesArray[i], insetVerticesArray[i], indexTuples);
  }

  return cube;

  // =============================================================================
  // Helper Functions
  // =============================================================================

  /// Get triangle indices to inset from facesToInset array
  /// @returns {Array} - Array containing the indices of the triangles to inset
  function getTriangleIndices() {
    const triangleIndices = [];
    const numberTrianglesOneSide = numberOfSegments ** 2 * 2;

    facesToInset.forEach((face, i) => {
      face.forEach(([x, y]) => {
        const triangleIndex =
          numberTrianglesOneSide * i +
          x * 2 +
          (numberOfSegments - 1 - y) * numberOfSegments * 2;
        // Determine if the triangle is on the edge of the cube
        const edgeValue =
          x === 0 ||
          x === numberOfSegments - 1 ||
          y === 0 ||
          y === numberOfSegments - 1
            ? 1
            : 0;
        triangleIndices.push(
          [triangleIndex, edgeValue],
          [triangleIndex + 1, edgeValue]
        );
      });
    });

    // Sort the triangleIndices array in descending order based on the first element of the inner arrays
    // so they are drawn in the correct order
    triangleIndices.sort((a, b) => b[0] - a[0]);
    return triangleIndices;
  }

  /// Get the vertex positions of a triangle
  /// @param {number} triangleIndex - Index of the triangle
  /// @returns {Array} - Array containing the positions of the triangle's vertices
  function getVertexPositions(triangleIndex) {
    const a = indices[3 * triangleIndex];
    const b = indices[3 * triangleIndex + 1];
    const c = indices[3 * triangleIndex + 2];
    return [
      new Vec3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]),
      new Vec3(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]),
      new Vec3(positions[c * 3], positions[c * 3 + 1], positions[c * 3 + 2]),
    ];
  }

  /// Get the normal of a triangle
  /// @param {number} triangleIndex - Index of the triangle
  /// @returns {Vec3} - Normal of the triangle
  function getFaceNormal(triangleIndex) {
    const [vertex1, vertex2, vertex3] = getVertexPositions(triangleIndex);
    const v1 = Vec3.differenceOf(vertex1, vertex2);
    const v2 = Vec3.differenceOf(vertex1, vertex3);

    const normal = v1.cross(v2);

    return normal.normalize();
  }

  /// Inset a triangle by insetDepth
  /// @param {Array} triangle - Array containing the triangle index and edge value (if triangle is on the edge of the cube)
  function insetTriangle(triangle) {
    const triangleIndex = triangle[0];
    const originalVerticesPositions = getVertexPositions(triangleIndex);
    const originalVertices = [
      indices[3 * triangleIndex],
      indices[3 * triangleIndex + 1],
      indices[3 * triangleIndex + 2],
    ];

    const faceNormal = getFaceNormal(triangleIndex);
    const startIndex = positions.length / 3;

    // Add new inset positions, normals and texCoords
    originalVerticesPositions.forEach(({ x, y, z }, i) => {
      positions.push(
        x - faceNormal.x * insetDepth,
        y - faceNormal.y * insetDepth,
        z - faceNormal.z * insetDepth
      );
      // Use same normals and texCoords as the original vertices
      normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
      texCoords.push(
        texCoords[2 * indices[3 * triangleIndex + i]],
        texCoords[2 * indices[3 * triangleIndex + i] + 1]
      );
    });

    // Delete the original triangle
    indices.splice(3 * triangleIndex, 3);

    const insetVertices = [startIndex, startIndex + 1, startIndex + 2];

    originalVerticesArray.push(originalVertices);
    insetVerticesArray.push(insetVertices);

    if (triangle[1] === 0) {
      // Create inset face if the triangle is not on the edge of the cube
      indices.push(insetVertices[0], insetVertices[1], insetVertices[2]);
    } else {
      const truncTo = 10; // Truncate to 1 decimal places -> needed to avoid floating point errors
      const insetPosition = insetVertices.map((index) => [
        Math.trunc(positions[index * 3] * truncTo) / truncTo,
        Math.trunc(positions[index * 3 + 1] * truncTo) / truncTo,
        Math.trunc(positions[index * 3 + 2] * truncTo) / truncTo,
      ]);

      if (isDuplicateTriangle(edgeWalls, insetPosition)) {
        // Remove the last inset vertices and original vertices if triangle already exists
        originalVerticesArray.pop();
        insetVerticesArray.pop();
      }
      // Add the inset vertices to the edgeWalls array to check for duplicates
      edgeWalls.push(insetPosition);
    }
  }

  /// Check if there is already a triangle with the same vertices
  /// @param {Array} triangleArray - Array containing already existing triangles
  /// @param {Array} targetTriangle - Array containing the vertices of the triangle to check
  /// @returns {boolean} - True if the triangle is already in the array, false otherwise
  function isDuplicateTriangle(triangleArray, targetTriangle) {
    let triangleInArray = false;
    const targetTriangleSorted = sortFace(targetTriangle);

    for (let i = 0; i < triangleArray.length - 1; i += 2) {
      let combinedArray = [...triangleArray[i], ...triangleArray[i + 1]];
      let uniqueSet = new Set(
        combinedArray.map((subArray) => JSON.stringify(subArray))
      );
      const vertices = sortFace(
        Array.from(uniqueSet).map((item) => JSON.parse(item))
      );
      if (
        JSON.stringify(vertices).includes(
          JSON.stringify(targetTriangleSorted[0])
        ) &&
        JSON.stringify(vertices).includes(
          JSON.stringify(targetTriangleSorted[1])
        ) &&
        JSON.stringify(vertices).includes(
          JSON.stringify(targetTriangleSorted[2])
        )
      ) {
        triangleInArray = true;
        break;
      }
    }
    return triangleInArray;

    /// Sort the vertices of a triangle in ascending order
    /// @param {Array} triangle - Array containing the vertices of a triangle
    /// @returns {Array} - Array containing the vertices of the triangle sorted in ascending order
    function sortFace(triangle) {
      triangle.forEach((vertex) => vertex.sort((a, b) => a - b));
      return triangle;
    }
  }

  /// Create walls at the edge of the inset faces
  /// @param {Array} topFaceVertices - Array containing the vertices of the original face
  /// @param {Array} bottomFaceVertices - Array containing the vertices of the inset face
  function createWalls(topFaceVertices, bottomFaceVertices, indexTuples) {
    // Create walls
    for (let i = 0; i < 3; i++) {
      // Check if the triangle is on the edge of the inset vertices by checking if there already is a triangle between the vertices
      const drawTriangle = indexTuples.some(
        (triangle) =>
          triangle.includes(topFaceVertices[i]) &&
          triangle.includes(topFaceVertices[(i + 1) % 3])
      );

      // Only draw the wall if it is on the edge of inset vertices (not between two inset triangles)
      if (drawTriangle) {
        indices.push(
          topFaceVertices[i],
          topFaceVertices[(i + 1) % 3],
          bottomFaceVertices[i]
        );
        indices.push(
          topFaceVertices[(i + 1) % 3],
          bottomFaceVertices[(i + 1) % 3],
          bottomFaceVertices[i]
        );
      }
    }
  }
}
