import { Mat3, Vec2, Vec3, Quat } from "../glance/js/math/index.js";
export { insetFaces, generateLabyrinth };

function insetFaces(box, numberOfSegments, size, faces) {
  // Validate the arguments.
  const positions = box.positions;
  const indices = box.indices;
  const texCoords = box.texCoords;
  const normals = box.normals;

  const inset = size / numberOfSegments;

  function getTriangleIndices() {
    let triangleIndices = [];
    for (let i = 0; i < faces.length; i++) {
      const numberTrianglesOneSide = numberOfSegments ** 2 * 2;
      const triangleIndex =
        numberTrianglesOneSide * faces[i][0] +
        faces[i][1] * 2 +
        (numberOfSegments - 1 - faces[i][2]) * numberOfSegments * 2;
      triangleIndices.push(triangleIndex, triangleIndex + 1);
    }
    return triangleIndices;
  }

  // Get vertex positions of triangle
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

  // Get face normal of triangle
  function getFaceNormal(triangleIndex) {
    // TODO: overcomplicated for inset faces?
    const vertex1 = getVertexPositions(triangleIndex)[0];
    const vertex2 = getVertexPositions(triangleIndex)[1];
    const vertex3 = getVertexPositions(triangleIndex)[2];

    // Calculate vectors v1 and v2
    const v1 = {
      x: vertex2.x - vertex1.x,
      y: vertex2.y - vertex1.y,
      z: vertex2.z - vertex1.z,
    };
    const v2 = {
      x: vertex3.x - vertex1.x,
      y: vertex3.y - vertex1.y,
      z: vertex3.z - vertex1.z,
    };

    // Calculate the cross product of v1 and v2
    const normal = {
      x: v1.y * v2.z - v1.z * v2.y,
      y: v1.z * v2.x - v1.x * v2.z,
      z: v1.x * v2.y - v1.y * v2.x,
    };

    // Normalize the normal vector
    const length = Math.sqrt(
      normal.x * normal.x + normal.y * normal.y + normal.z * normal.z
    );
    normal.x /= length;
    normal.y /= length;
    normal.z /= length;

    return normal;
  }

  // Inset a triangle face
  function insetFace(triangleIndex) {
    const originalVerticesPositions = getVertexPositions(triangleIndex);
    const originalVertices = [
      indices[3 * triangleIndex],
      indices[3 * triangleIndex + 1],
      indices[3 * triangleIndex + 2],
    ];
    const faceNormal = getFaceNormal(triangleIndex);
    const length = positions.length;

    // Add new inset vertices
    for (let i = 0; i < 3; i++) {
      positions.push(
        originalVerticesPositions[i].x - faceNormal.x * inset,
        originalVerticesPositions[i].y - faceNormal.y * inset,
        originalVerticesPositions[i].z - faceNormal.z * inset
      );
      normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
      // Use the same uvs as the original vertices
      const uvs = new Vec2(
        texCoords[2 * originalVertices[i]],
        texCoords[2 * originalVertices[i] + 1]
      );
      texCoords.push(uvs.x, uvs.y);
    }
    // Replace original vertices by insetVertices
    const insetVertices = [length / 3, length / 3 + 1, length / 3 + 2];
    indices.splice(
      3 * triangleIndex,
      3,
      insetVertices[0],
      insetVertices[1],
      insetVertices[2]
    );

    // createWalls(originalVertices, insetVertices)
    return { originalVertices, insetVertices };
  }

  function createWalls(topFaceVertices, bottomFaceVertices) {
    // TODO: normals facing the wrong way?

    // Create list of index tuples
    let indexTuples = [];
    for (let i = 0; i < indices.length; i += 3) {
      indexTuples.push([indices[i], indices[i + 1], indices[i + 2]]);
    }

    // Create walls
    for (let i = 0; i < 3; i++) {
      let drawTriangle = false;
      for (let j = 0; j < indexTuples.length; j++) {
        // Test if the triangle is on the edge of the inset vertices
        if (
          indexTuples[j].includes(topFaceVertices[i]) &&
          indexTuples[j].includes(topFaceVertices[(i + 1) % 3])
        ) {
          drawTriangle = true;
          break;
        }
      }

      // Only draw the triangle if it is on the edge of inset vertices (not between two inset triangles)
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

  const triangleIndices = getTriangleIndices();
  let originalVertices = [];
  let insetVertices = [];

  // Create inset faces and remove original ones
  for (let i = 0; i < triangleIndices.length; i++) {
    const triangleIndex = triangleIndices[i];

    // Store original and inset vertices
    const temp = insetFace(triangleIndex);
    originalVertices.push(temp.originalVertices);
    insetVertices.push(temp.insetVertices);
  }

  // Create walls at the edge of the inset faces
  for (let i = 0; i < triangleIndices.length; i++) {
    createWalls(originalVertices[i], insetVertices[i]);
  }
}

function generateLabyrinth(segments) {
  const width = (segments / 2) | 0;

  // TODO: start can be either on the left wall or in the middle
  let startX = 0;
  let startY = width / 2;
  const endX = width - 1;
  const endY = width / 2;
  let route;
  let labyrinthArray;

  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  init();

  function init() {
    route = [];
    labyrinthArray = [];

    // Initialize labyrinthArray with all zeros = walls
    for (let i = 0; i < width * 2 + 1; i++) {
      labyrinthArray[i] = [];
      for (let j = 0; j < width * 2 + 1; j++) {
        labyrinthArray[i][j] = 0;
      }
    }

    labyrinthArray[startY * 2][startX * 2 + 1] = 1; // Mark the start position as path
    route = [[startX, startY]];

    // Create entry and exit points
    labyrinthArray[startY * 2][startX * 2] = 1;
    labyrinthArray[endY * 2][endX * 2 + 2] = 1;
  }

  function loop() {
    while (true) {
      const alternatives = [];

      startX = route[route.length - 1][0] | 0;
      startY = route[route.length - 1][1] | 0;

      for (let i = 0; i < directions.length; i++) {
        if (
          labyrinthArray[(directions[i][1] + startY) * 2 + 1] != undefined &&
          labyrinthArray[(directions[i][1] + startY) * 2 + 1][
            (directions[i][0] + startX) * 2 + 1
          ] === 0
        ) {
          alternatives.push(directions[i]);
        }
      }

      if (alternatives.length === 0) {
        route.pop();
        if (route.length === 0) {
          if (labyrinthArray[endY * 2][endX * 2 + 1] === 0) {
            // Start again if end point is not connected
            init();
            loop();
          }
          return;
        }
        continue;
      }

      const direction = alternatives[(Math.random() * alternatives.length) | 0];

      route.push([direction[0] + startX, direction[1] + startY]);

      labyrinthArray[(direction[1] + startY) * 2 + 1][
        (direction[0] + startX) * 2 + 1
      ] = 1; // Mark the path in labyrinthArray
      labyrinthArray[direction[1] + startY * 2 + 1][
        direction[0] + startX * 2 + 1
      ] = 1; // Mark the current cell as part of the path
    }
  }
  loop();

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
  return arrayToCoordinates(labyrinthArray);
}

// TODO: entry in middle
// TODO: all sides of the cube
