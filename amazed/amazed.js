import { Vec3 } from "../glance/js/math/index.js";
export { insetFaces, generateLabyrinthCube };

function insetFaces(box, numberOfSegments, size, faces) {
  // Initialize variables
  const { positions, indices, texCoords, normals } = box;
  const insetDepth = size / numberOfSegments;
  const originalVerticesArray = [];
  const insetVerticesArray = [];

    // Get triangle indices from array of faces to be inset
    const triangleIndices = getTriangleIndices();

    // Inset the faces
    for (let i = 0; i < triangleIndices.length; i++) {
      insetTriangle(triangleIndices[i]);
    }
  
    // Create walls at the edge of the inset faces
    for (let i = 0; i < insetVerticesArray.length; i++) {
      createWalls(originalVerticesArray[i], insetVerticesArray[i]);
    }

  function getTriangleIndices() {
    const triangleIndices = [];
    const numberTrianglesOneSide = numberOfSegments ** 2 * 2;

    faces.forEach((face, i) => {
      face.forEach(([x, y]) => {
        const triangleIndex = numberTrianglesOneSide * i + x * 2 + (numberOfSegments - 1 - y) * numberOfSegments * 2;
        // Determine if the triangle is on the edge of the box
        const edgeValue = (x === 0 || x === numberOfSegments - 1 || y === 0 || y === numberOfSegments - 1) ? 1 : 0;
        triangleIndices.push([triangleIndex, edgeValue], [triangleIndex + 1, edgeValue]);
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
    const v1 = Vec3.differenceOf(vertex1, vertex2)
    const v2 = Vec3.differenceOf(vertex1, vertex3)

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
      positions.push(x - faceNormal.x * insetDepth, y - faceNormal.y * insetDepth, z - faceNormal.z * insetDepth);
      // Use same normals and texCoords as the original vertices
      normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
      texCoords.push(texCoords[2 * indices[3 * triangleIndex + i]], texCoords[2 * indices[3 * triangleIndex + i] + 1]);
    });

    // Delete the original triangle
    indices.splice(3 * triangleIndex, 3);

    const insetVertices = [startIndex, startIndex + 1, startIndex + 2];

    // Create inset face if the triangle is not on the edge of the box
    if (triangle[1] === 0) {
      indices.push(insetVertices[0], insetVertices[1], insetVertices[2]);
    }

    originalVerticesArray.push(originalVertices);
    insetVerticesArray.push(insetVertices);
  }

  function createWalls(topFaceVertices, bottomFaceVertices) {
    // Create list of index tuples
    let indexTuples = [];
    for (let i = 0; i < indices.length; i += 3) {
      indexTuples.push([indices[i], indices[i + 1], indices[i + 2]]);
    }

    // Create walls
    for (let i = 0; i < 3; i++) {
      // Check if the triangle is on the edge of the inset vertices by checking if there already is a triangle between the vertices
      const drawTriangle = indexTuples.some(triangle =>
        triangle.includes(topFaceVertices[i]) && triangle.includes(topFaceVertices[(i + 1) % 3])
      );

      // Only draw the wall if it is on the edge of inset vertices (not between two inset triangles)
      if (drawTriangle) {
        indices.push(topFaceVertices[i], topFaceVertices[(i + 1) % 3], bottomFaceVertices[i]);
        indices.push(topFaceVertices[(i + 1) % 3], bottomFaceVertices[(i + 1) % 3], bottomFaceVertices[i]);
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

    let points;
    let startPoint;
    let endPoint;
    let entryPoint;
    let exitPoint;

    points = getPoints(startPosition);
    startPoint = points[0];
    entryPoint = points[1];

    points = getPoints(endPosition);
    endPoint = points[0];
    exitPoint = points[1];

    let route;
    let labyrinthArray;

    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    initLabyrinth();
    loop();
    return arrayToCoordinates(labyrinthArray);

    function getPoints(position) {
      let point;
      let wallPoint;
      switch (position) {
        case "left":
          point = [0.5, width / 2];
          wallPoint = [0, width / 2];
          return [point, wallPoint];
        case "middle":
          point = [width / 2, width / 2];
          wallPoint = point;
          return [point, wallPoint];
        case "top":
          point = [width / 2, 0.5];
          wallPoint = [width / 2, 0];
          return [point, wallPoint];
        case "bottom":
          point = [width / 2, width - 0.5];
          wallPoint = [width / 2, width];
          return [point, wallPoint];
        case "right":
          point = [width - 0.5, width / 2];
          wallPoint = [width, width / 2];
          return [point, wallPoint];
      }
    }

    function initLabyrinth() {
      route = [];
      labyrinthArray = [];

      // Initialize labyrinthArray with all zeros = walls
      for (let i = 0; i < width * 2 + 1; i++) {
        labyrinthArray[i] = [];
        for (let j = 0; j < width * 2 + 1; j++) {
          labyrinthArray[i][j] = 0;
        }
      }

      labyrinthArray[startPoint[1] * 2][startPoint[0] * 2] = 1; // Mark the start position as path
      route = [startPoint];

      // Create entry and exit points
      labyrinthArray[entryPoint[1] * 2][entryPoint[0] * 2] = 1;
      labyrinthArray[exitPoint[1] * 2][exitPoint[0] * 2] = 1;
    }

    function loop() {
      while (true) {
        const alternatives = [];

        startPoint = [
          route[route.length - 1][0] | 0,
          route[route.length - 1][1] | 0,
        ];

        for (let i = 0; i < directions.length; i++) {
          if (
            labyrinthArray[(directions[i][1] + startPoint[1]) * 2 + 1] !=
            undefined &&
            labyrinthArray[(directions[i][1] + startPoint[1]) * 2 + 1][
            (directions[i][0] + startPoint[0]) * 2 + 1
            ] === 0
          ) {
            alternatives.push(directions[i]);
          }
        }

        if (alternatives.length === 0) {
          route.pop();
          if (route.length === 0) {
            // Start again if end point is not connected
            if (labyrinthArray[endPoint[1] * 2][endPoint[0] * 2] === 0) {
              initLabyrinth();
              loop();
            }

            // Start again if walls aren't connected properly
            for (let i = 1; i < labyrinthArray.length - 1; i++) {
              for (let j = 1; j < labyrinthArray[i].length - 1; j++) {
                if (
                  labyrinthArray[i][j] === 1 &&
                  labyrinthArray[i + 1][j] === 1 &&
                  labyrinthArray[i][j + 1] === 1 &&
                  labyrinthArray[i + 1][j + 1] === 1
                ) {
                  initLabyrinth();
                  loop();
                }
                if (
                  labyrinthArray[i][j] === 1 &&
                  labyrinthArray[i + 1][j + 1] === 1 &&
                  labyrinthArray[i + 1][j] === 0 &&
                  labyrinthArray[i][j + 1] === 0
                ) {
                  initLabyrinth();
                  loop();
                }
                if (
                  labyrinthArray[i][j] === 1 &&
                  labyrinthArray[i - 1][j + 1] === 1 &&
                  labyrinthArray[i - 1][j] === 0 &&
                  labyrinthArray[i][j + 1] === 0
                ) {
                  initLabyrinth();
                  loop();
                }
              }
            }
            // Return if labyrinth is complete
            return;
          }
          continue;
        }

        const direction =
          alternatives[(Math.random() * alternatives.length) | 0];

        route.push([
          direction[0] + startPoint[0],
          direction[1] + startPoint[1],
        ]);

        labyrinthArray[(direction[1] + startPoint[1]) * 2 + 1][
          (direction[0] + startPoint[0]) * 2 + 1
        ] = 1; // Mark the path in labyrinthArray
        labyrinthArray[direction[1] + startPoint[1] * 2 + 1][
          direction[0] + startPoint[0] * 2 + 1
        ] = 1; // Mark the current cell as part of the path
      }
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
