export { generate3dLabyrinth as generateLabyrinth };

/// Generate a 3d labyrinth with a specified number of segments
/// original labyrinth code: https://codepen.io/GabbeV/pen/Abzwga
/// @param {number} segments - Number of segments of the cube
/// @returns {Array} - Array containing the coordinates of faces to be inset (= labyrinth path)
function generate3dLabyrinth(segments) {
  // Specify entry/exit points for each side of the cube
  const side0 = generateLabyrinth(segments, "top", "bottom");
  const side1 = generateLabyrinth(segments, "bottom", "right");
  const side2 = generateLabyrinth(segments, "left", "right");
  const side3 = generateLabyrinth(segments, "bottom", "left");
  const side4 = generateLabyrinth(segments, "left", "middle");
  const side5 = generateLabyrinth(segments, "middle", "top");
  return [side0, side1, side2, side3, side4, side5];

  /// Generate a labyrinth with a specified number of segments and entry/exit points
  /// @param {number} segments - Number of segments of the cube
  /// @param {string} startPosition - Start position of the labyrinth (left, middle, top, bottom, right)
  /// @param {string} endPosition - End position of the labyrinth (left, middle, top, bottom, right)
  /// @returns {Array} - Array containing the coordinates of faces to be inset (= labyrinth path)
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

    /// Get position of start & entry or end & exit points, entry/exit points needed for crossing to next side of the cube
    /// @param {string} position - Position of the point (left, middle, top, bottom, right)
    /// @returns {Array} - Array containing the coordinates of the start & entry or end & exit points
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

    /// Initialize the labyrinth array, set start point for depth-first search and create entry and exit points
    function initLabyrinthArray() {
      labyrinthArray = Array.from({ length: width * 2 + 1 }, () =>
        Array(width * 2 + 1).fill(0)
      );

      labyrinthArray[startPoint[1] * 2][startPoint[0] * 2] = 1; // Mark the start position for depth-first search

      // Create entry and exit points
      labyrinthArray[entryPoint[1] * 2][entryPoint[0] * 2] = 1;
      labyrinthArray[exitPoint[1] * 2][exitPoint[0] * 2] = 1;
    }

    /// Create the labyrinth path using depth-first search
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

    /// Check if there are improper wall connections in the labyrinth
    /// @param {Array} labyrinthArray - Array containing the labyrinth
    /// @returns {boolean} - True if there are improper wall connections, false otherwise
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

    /// Convert the labyrinth array to an array of faces on the cube
    /// @param {Array} array - Array containing the labyrinth
    /// @returns {Array} - Array containing the faces to be inset
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
