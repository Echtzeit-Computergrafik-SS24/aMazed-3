import { Vec3 } from "../glance/js/math/index.js";
export { insetFaces, generateLabyrinthCube };

function insetFaces(box, numberOfSegments, size, faces) {
  // Initialize variables
  const { positions, indices, texCoords, normals } = box;
  const insetDepth = size / numberOfSegments;
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

  for (let i = 0; i < indices.length; i += 3) {
    indexTuples.push([indices[i], indices[i + 1], indices[i + 2]]);
  }

  // Create walls at the edge of the inset faces
  for (let i = 0; i < insetVerticesArray.length; i++) {
    createWalls(originalVerticesArray[i], insetVerticesArray[i], indexTuples);
  }

  function isDuplicateTriangle(triangleArray, targetTriangle) {
    let triangleInArray = false;
    const targetTriangleSorted = sortFace(targetTriangle);

    for (let i = 0; i < triangleArray.length - 1; i += 2) {
      let combinedArray = [...triangleArray[i], ...triangleArray[i + 1]];
      let uniqueSet = new Set(combinedArray.map((subArray) => JSON.stringify(subArray)));
      const vertices = sortFace(Array.from(uniqueSet).map((item) => JSON.parse(item)));
      if (
        JSON.stringify(vertices).includes(JSON.stringify(targetTriangleSorted[0])) &&
        JSON.stringify(vertices).includes(JSON.stringify(targetTriangleSorted[1])) &&
        JSON.stringify(vertices).includes(JSON.stringify(targetTriangleSorted[2]))
      ) {
        triangleInArray = true;
        break;
      }
    }
    return triangleInArray;
  }

  function sortFace(triangle) {
    triangle.forEach((vertex) => vertex.sort((a, b) => a - b));
    return triangle;
  }

  function roundVector(vector, roundTo = 1000000) {
    const truncTo = 1000;
    vector.x = Math.round(vector.x * roundTo) / roundTo;
    vector.y = Math.round(vector.y * roundTo) / roundTo;
    vector.z = Math.round(vector.z * roundTo) / roundTo;
    vector.x = Math.trunc(vector.x * truncTo) / truncTo;
    vector.y = Math.trunc(vector.y * truncTo) / truncTo;
    vector.z = Math.trunc(vector.z * truncTo) / truncTo;
    return vector;
  }

  function getTriangleIndices() {
    const triangleIndices = [];
    const numberTrianglesOneSide = numberOfSegments ** 2 * 2;

    faces.forEach((face, i) => {
      face.forEach(([x, y]) => {
        const triangleIndex =
          numberTrianglesOneSide * i +
          x * 2 +
          (numberOfSegments - 1 - y) * numberOfSegments * 2;
        // Determine if the triangle is on the edge of the box
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
    triangleIndices.sort((a, b) => b[0] - a[0]);

    return triangleIndices;
  }

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

  function getFaceNormal(triangleIndex) {
    const [vertex1, vertex2, vertex3] = getVertexPositions(triangleIndex);
    const v1 = Vec3.differenceOf(vertex1, vertex2);
    const v2 = Vec3.differenceOf(vertex1, vertex3);

    const normal = v1.cross(v2);

    return normal.normalize();
  }

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

    // Create inset face if the triangle is not on the edge of the box
    if (triangle[1] === 0) {
      indices.push(insetVertices[0], insetVertices[1], insetVertices[2]);
      originalVerticesArray.push(originalVertices);
      insetVerticesArray.push(insetVertices);
    } else {
      const truncTo = 10;
      const insetPosition = insetVertices.map((index) => [
        Math.trunc(positions[index * 3] * truncTo) / truncTo,
        Math.trunc(positions[index * 3 + 1] * truncTo) / truncTo,
        Math.trunc(positions[index * 3 + 2] * truncTo) / truncTo,
      ]);

      if (!isDuplicateTriangle(edgeWalls, insetPosition)) {
        originalVerticesArray.push(originalVertices);
        insetVerticesArray.push(insetVertices);
      }
      edgeWalls.push(insetPosition);
    }
  }

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

function generateLabyrinthCube(segments) {
  const side0 = generateLabyrinth(segments, "top", "bottom");
  const side1 = generateLabyrinth(segments, "bottom", "right");
  const side2 = generateLabyrinth(segments, "left", "right");
  const side3 = generateLabyrinth(segments, "bottom", "left");
  const side4 = generateLabyrinth(segments, "left", "middle");
  const side5 = generateLabyrinth(segments, "middle", "top");
  return [side0, side1, side2, side3, side4, side5];

  function generateLabyrinth(segments, startPosition, endPosition) {
    const width = Math.floor(segments / 2);
    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    let [startPoint, entryPoint] = getPoints(startPosition);
    let [endPoint, exitPoint] = getPoints(endPosition);

    let route = [];
    let labyrinthArray;

    createPath();
    return arrayToCoordinates(labyrinthArray);

    function getPoints(position) {
      switch (position) {
        case "left":
          return [
            [0.5, width / 2],
            [0, width / 2],
          ];
        case "middle":
          return [
            [width / 2, width / 2],
            [width / 2, width / 2],
          ];
        case "top":
          return [
            [width / 2, 0.5],
            [width / 2, 0],
          ];
        case "bottom":
          return [
            [width / 2, width - 0.5],
            [width / 2, width],
          ];
        case "right":
          return [
            [width - 0.5, width / 2],
            [width, width / 2],
          ];
      }
    }

    function initLabyrinthArray() {
      labyrinthArray = Array.from({ length: width * 2 + 1 }, () =>
        Array(width * 2 + 1).fill(0)
      );

      labyrinthArray[startPoint[1] * 2][startPoint[0] * 2] = 1; // Mark the start position for depth-first search

      // Create entry and exit points
      labyrinthArray[entryPoint[1] * 2][entryPoint[0] * 2] = 1;
      labyrinthArray[exitPoint[1] * 2][exitPoint[0] * 2] = 1;
    }

    function createPath() {
      initLabyrinthArray();
      route = [startPoint];

      while (true) {
        const currentPoint = [
          Math.floor(route[route.length - 1][0]),
          Math.floor(route[route.length - 1][1]),
        ];

        // Write valid directions to the alternatives array
        let alternatives = directions.filter(([dx, dy]) => {
          const [nx, ny] = [currentPoint[0] + dx, currentPoint[1] + dy];
          return (
            labyrinthArray[ny * 2 + 1] !== undefined &&
            labyrinthArray[ny * 2 + 1][nx * 2 + 1] === 0
          );
        });

        if (alternatives.length === 0) {
          route.pop();
          if (route.length === 0) {
            if (isImproperWallConnection(labyrinthArray)) {
              // Reset the labyrinthArray and try again
              createPath();
            }
            // Return if labyrinth is complete
            return;
          }
          continue;
        }

        const direction =
          alternatives[Math.floor(Math.random() * alternatives.length)];

        const nextPoint = [
          direction[0] + currentPoint[0],
          direction[1] + currentPoint[1],
        ];

        route.push(nextPoint);

        labyrinthArray[nextPoint[1] * 2 + 1][nextPoint[0] * 2 + 1] = 1; // Mark the path in labyrinthArray
        labyrinthArray[currentPoint[1] * 2 + 1 + direction[1]][
          currentPoint[0] * 2 + 1 + direction[0]
        ] = 1; // Mark the current cell as part of the path
      }
    }

    function isImproperWallConnection(labyrinthArray) {
      const length = labyrinthArray.length;

      // Return true if the end point is not connected
      if (labyrinthArray[endPoint[1] * 2][endPoint[0] * 2] === 0) {
        return true;
      }

      // Define the patterns to check
      const patterns = [
        // Pattern 1: all adjacent cells are walls
        (i, j) =>
          labyrinthArray[i][j] === 1 &&
          labyrinthArray[i + 1][j] === 1 &&
          labyrinthArray[i][j + 1] === 1 &&
          labyrinthArray[i + 1][j + 1] === 1,

        // Pattern 2: diagonal walls with non-walls adjacent
        (i, j) =>
          labyrinthArray[i][j] === 1 &&
          labyrinthArray[i + 1][j + 1] === 1 &&
          labyrinthArray[i + 1][j] === 0 &&
          labyrinthArray[i][j + 1] === 0,

        // Pattern 3: another diagonal walls pattern
        (i, j) =>
          labyrinthArray[i][j] === 1 &&
          labyrinthArray[i - 1][j + 1] === 1 &&
          labyrinthArray[i - 1][j] === 0 &&
          labyrinthArray[i][j + 1] === 0,
      ];

      // Iterate through the labyrinth array
      for (let i = 1; i < length - 1; i++) {
        for (let j = 1; j < labyrinthArray[i].length - 1; j++) {
          if (patterns.some((pattern) => pattern(i, j))) {
            return true;
          }
        }
      }

      return false;
    }

    function arrayToCoordinates(array) {
      const coordinates = [];
      for (let i = 0; i < segments; i++) {
        for (let j = 0; j < segments; j++) {
          if (array[i][j] === 1) {
            coordinates.push([j, i]);
          }
        }
      }
      return coordinates;
    }
  }
}
