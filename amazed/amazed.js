import { generateLabyrinth } from "./generate_labyrinth.js";
import { insetFaces } from "./inset_faces.js";
import { GameObject, Cube, Player } from "./gameObjects.js";
import * as glance from '../glance/js/index.js';
export { generateLabyrinthCube };

function generateLabyrinthCube(numberOfSegments, cubeSize) {
  cubeSize = 0.75;
  const cube = glance.createBox("maze-geo", {
    width: cubeSize,
    height: cubeSize,
    depth: cubeSize,
    widthSegments: numberOfSegments,
    heightSegments: numberOfSegments,
    depthSegments: numberOfSegments,
  });
  const labyrinth = generateLabyrinth(numberOfSegments);
  const labyrinthCube = insetFaces(cube, numberOfSegments, cubeSize, labyrinth);
  return labyrinthCube;
}
