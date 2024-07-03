import { Vec3, Vec2 } from "../glance/math/index.js";
import { computeTangents, removeUnusedVertices } from "../glance/assets/geo.js";
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

  // Remove unused faces
  removeUnusedVertices(cube.name, cube.indices, cube.positions, cube.texCoords, cube.normals);
  cube.tangents = computeTangents(cube.positions, cube.texCoords, cube.indices, cube.normals);

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
    const faceNormal = getNormalFromVertices(
      new Vec3(
        positions[topFaceVertices[0] * 3],
        positions[topFaceVertices[0] * 3 + 1],
        positions[topFaceVertices[0] * 3 + 2]
      ),
      new Vec3(
        positions[topFaceVertices[1] * 3],
        positions[topFaceVertices[1] * 3 + 1],
        positions[topFaceVertices[1] * 3 + 2]
      ),
      new Vec3(
        positions[topFaceVertices[2] * 3],
        positions[topFaceVertices[2] * 3 + 1],
        positions[topFaceVertices[2] * 3 + 2]
      )
    );
    // Create walls
    for (let i = 0; i < 3; i++) {
      // Check if the triangle is on the edge of the inset vertices by checking if there already is a triangle between the vertices
      const drawTriangle = indexTuples.some(
        (triangle) =>
          triangle.includes(topFaceVertices[i]) &&
          triangle.includes(topFaceVertices[(i + 1) % 3])
      );

      // Get topFaceVertices positions
      const currentTopFacePositions = new Vec3(
        positions[topFaceVertices[i] * 3],
        positions[topFaceVertices[i] * 3 + 1],
        positions[topFaceVertices[i] * 3 + 2]
      );

      const nextTopFacePositions = new Vec3(
        positions[topFaceVertices[(i + 1) % 3] * 3],
        positions[topFaceVertices[(i + 1) % 3] * 3 + 1],
        positions[topFaceVertices[(i + 1) % 3] * 3 + 2]
      );

      // Get bottomFaceVertices positions
      const currentBottomFacePositions = new Vec3(
        positions[bottomFaceVertices[i] * 3],
        positions[bottomFaceVertices[i] * 3 + 1],
        positions[bottomFaceVertices[i] * 3 + 2]
      );

      const nextBottomFacePositions = new Vec3(
        positions[bottomFaceVertices[(i + 1) % 3] * 3],
        positions[bottomFaceVertices[(i + 1) % 3] * 3 + 1],
        positions[bottomFaceVertices[(i + 1) % 3] * 3 + 2]
      );

      // get topFace texCoords
      const currentTopFaceTexCoords = new Vec2(
        texCoords[topFaceVertices[i] * 2],
        texCoords[topFaceVertices[i] * 2 + 1]
      );

      const nextTopFaceTexCoords = new Vec2(
        texCoords[topFaceVertices[(i + 1) % 3] * 2],
        texCoords[topFaceVertices[(i + 1) % 3] * 2 + 1]
      );

      let wallNormal = getNormalFromVertices(
        currentTopFacePositions,
        nextTopFacePositions,
        currentBottomFacePositions
      );

      // Only draw the wall if it is on the edge of inset vertices (not between two inset triangles)
      if (drawTriangle) {
        /// Create new vertices to get correct uv coordinates
        // Push to positions
        const posLength = positions.length / 3;
        positions.push(
          currentTopFacePositions.x,
          currentTopFacePositions.y,
          currentTopFacePositions.z,
          nextTopFacePositions.x,
          nextTopFacePositions.y,
          nextTopFacePositions.z,
          currentBottomFacePositions.x,
          currentBottomFacePositions.y,
          currentBottomFacePositions.z,
          nextBottomFacePositions.x,
          nextBottomFacePositions.y,
          nextBottomFacePositions.z
        );

        // Push to normals
        normals.push(
          wallNormal.x,
          wallNormal.y,
          wallNormal.z,
          wallNormal.x,
          wallNormal.y,
          wallNormal.z,
          wallNormal.x,
          wallNormal.y,
          wallNormal.z,
          wallNormal.x,
          wallNormal.y,
          wallNormal.z
        );

        if (faceNormal.x === 0 && faceNormal.y !== 0 && faceNormal.z === 0) {
            wallNormal.z = -wallNormal.z;
        } else if (
          faceNormal.x !== 0 &&
          faceNormal.y === 0 &&
          faceNormal.z === 0
        ) {
            const temp = wallNormal.x;
            wallNormal.x = wallNormal.z;
            wallNormal.z = temp;
        }
        // Push uv coordinates to texCoords with offset depending on face normal
        if (wallNormal.x !== 0 && wallNormal.y === 0 && wallNormal.z === 0) {
          texCoords.push(
            currentTopFaceTexCoords[0],
            currentTopFaceTexCoords[1],
            nextTopFaceTexCoords[0],
            nextTopFaceTexCoords[1],
            currentTopFaceTexCoords[0] + 1 / numberOfSegments * wallNormal.x,
            currentTopFaceTexCoords[1],
            nextTopFaceTexCoords[0] + 1 / numberOfSegments * wallNormal.x,
            nextTopFaceTexCoords[1]
          );
        } else if (
          wallNormal.x === 0 &&
          wallNormal.y !== 0 &&
          wallNormal.z === 0
        ) {
          texCoords.push(
            currentTopFaceTexCoords[0],
            currentTopFaceTexCoords[1],
            nextTopFaceTexCoords[0],
            nextTopFaceTexCoords[1],
            currentTopFaceTexCoords[0],
            currentTopFaceTexCoords[1] + 1 / numberOfSegments * wallNormal.y,
            nextTopFaceTexCoords[0],
            nextTopFaceTexCoords[1] + 1 / numberOfSegments * wallNormal.y
          );
        } else if (
          wallNormal.x === 0 &&
          wallNormal.y === 0 &&
          wallNormal.z !== 0
        ) {
          texCoords.push(
            currentTopFaceTexCoords[0],
            currentTopFaceTexCoords[1],
            nextTopFaceTexCoords[0],
            nextTopFaceTexCoords[1],
            currentTopFaceTexCoords[0],
            currentTopFaceTexCoords[1] + 1 / numberOfSegments * wallNormal.z,
            nextTopFaceTexCoords[0],
            nextTopFaceTexCoords[1] + 1 / numberOfSegments * wallNormal.z
          );
        } 

        // Push new indices
        indices.push(posLength, posLength + 1, posLength + 2);
        indices.push(posLength + 1, posLength + 3, posLength + 2);
      }
    }

    function getNormalFromVertices(v1, v2, v3) {
      const a = Vec3.differenceOf(v1, v2);
      const b = Vec3.differenceOf(v1, v3);
      return a.cross(b).normalize().round();
    }
  }
}
