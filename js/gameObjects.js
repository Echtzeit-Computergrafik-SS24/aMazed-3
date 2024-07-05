import * as glance from '../glance/index.js';
import { generateLabyrinth } from "./generate_labyrinth.js";
import { insetFaces } from "./inset_faces.js";
export { GameObject, Cube, MazeCube, Player };

// some methods for segmented objects
function getSegmentIndex(side, segment, numSegments) {
    return side * numSegments ** 2 + segment;
}
function getUniqueSegmentIndices(segment, indices) {
    // filter out any repeat indices
    return new Set(indices.slice(segment * 6, segment * 6 + 6))
}
function getSegmentVerts(indices, positions) {
    let segmentVerts = [];
    indices.forEach((index) => {
        segmentVerts.push(glance.Vec3.fromArray(positions.slice(index * 3, index * 3 + 3)));
    });
    return segmentVerts;
}
function getSegmentNormal(indices, normals) {
    // return the normal of the first vertex of the segment
    let index = indices.values().next().value;
    let normal = glance.Vec3.fromArray(normals.slice(index * 3, index * 3 + 3));
    return normal
}
function getSegmentCenter(segmentVerts) {
    let center = glance.Vec3.zero();
    segmentVerts.forEach(coord => center.add(glance.Vec3.fromArray(coord).scale(1 / segmentVerts.length)));
    return center;
}
function getSegment(geo, side, nthSegment) {
    let segment = getSegmentIndex(side, nthSegment, geo.widthSegs);  // assumes, that the parent object has equal width, height and depth segments
    let segIndices = getUniqueSegmentIndices(segment, geo.indices);
    let segPositions = getSegmentVerts(segIndices, geo.positions);
    let segNormals = getSegmentNormal(segIndices, geo.normals);
    return { 'indices': segIndices, 'positions': segPositions, 'normals': segNormals };
}
function convertSegmentToXY(nthSegment, numSegments) {
    let x = nthSegment % numSegments;
    let y = numSegments - Math.floor(nthSegment / numSegments) - 1;

    return [x, y];
}
function convertSegmentToSideNth(x, y, numSegments) {
    let nthSegment = Math.abs(y - numSegments + 1) * numSegments + x;
    return nthSegment;
}


// goal of this class is to add further functionality to geometries
// point of this class are parent/child relationships, not making a wrapper for Mat4 class. 
// So for changing model matrix: get it, change it with Mat4 methods and set it
// note for myself: implementing Mat4 methods makes no sense, as stringing them together requires returning mat4 which means i can't update children
class GameObject {
    #modelMatrix
    constructor(geo, modelMatrix) {
        this.geo = geo;
        this.#modelMatrix = modelMatrix;
        this.parent = null;
        this.parentConfig = null;
        this.children = [];
    }
    setParent(parent, parentConfig = { rotate: true, position: true, scale: true }) {
        if (this.parent === parent || parent === this) return;  // prevent adding the same child twice to same parent or being its own parent
        this.parentConfig = parentConfig;
        this.parent = parent;
        this.parent.children.push(this);
    }
    getModelMatrix() {
        if (this.parent === null) return this.#modelMatrix.clone();  // if there is no parent, just return the model matrix
        else return this.parent.getModelMatrix().mul(this.#modelMatrix);  // if there is a parent, return the parent's model matrix multiplied with the child's model matrix
    }
    getModelMatrixNoParent() {
        return this.#modelMatrix.clone();
    }
    updateModelMatrix(update, isInitialUpdate = true)  // update being a Mat4 that will be multiplied with the current model matrix
    {
        this.#modelMatrix = this.#modelMatrix.mul(update);
    }
    setModelMatrix(newModelMatrix) {
        this.#modelMatrix = newModelMatrix;
    }
}

class Cube extends GameObject {
    constructor(geo, modelMatrix, size, numSegments) {
        super(geo, modelMatrix);
        this.size = size;
        this.numSegments = numSegments;
        this.segments = [];  // 2D array, 1st dimension is the side, 2nd dimension is the segment
    }
    static create(modelMatrix, size, numSegments) {
        let geo = glance.createBox('box-geo',
            {
                width: size,
                height: size,
                depth: size,
                widthSegments: numSegments,
                heightSegments: numSegments,
                depthSegments: numSegments
            });
        let cube = new Cube(geo, modelMatrix, size, numSegments);
        cube.initSegments();
        return cube;
    }
    initSegments() {
        for (let i = 0; i < 6; i++) {
            let side = [];
            for (let j = 0; j < this.numSegments ** 2; j++) {
                side.push(this.calcSegment(i, j));
            }
            this.segments.push(side);
        }
    }
    getSegments() {
        return this.segments;
    }
    getSegment(side, nthSegment) {
        return this.segments[side][nthSegment];
    }
    calcSegment(side, nthSegment) {
        const segIdx = getSegmentIndex(side, nthSegment, this.numSegments);
        const segIndices = getUniqueSegmentIndices(segIdx, this.geo.indices);
        const segPositions = getSegmentVerts(segIndices, this.geo.positions);
        const segNormal = getSegmentNormal(segIndices, this.geo.normals);
        const segCenter = getSegmentCenter(segPositions);

        return {
            'indices': segIndices,
            'positions': segPositions,
            'normal': segNormal,
            'center': segCenter
        };
    }
    getCubeSideNormals() {
        return [
            glance.Vec3.fromArray([1, 0, 0]).rotateMat4(this.getModelMatrix()),
            glance.Vec3.fromArray([-1, 0, 0]).rotateMat4(this.getModelMatrix()),
            glance.Vec3.fromArray([0, 1, 0]).rotateMat4(this.getModelMatrix()),
            glance.Vec3.fromArray([0, -1, 0]).rotateMat4(this.getModelMatrix()),
            glance.Vec3.fromArray([0, 0, 1]).rotateMat4(this.getModelMatrix()),
            glance.Vec3.fromArray([0, 0, -1]).rotateMat4(this.getModelMatrix())
        ];
    }
}

class MazeCube extends Cube {
    constructor(geo, modelMatrix, size, numSegments, labyrinth) {
        super(geo, modelMatrix, size, numSegments);
        this.labyrinth = labyrinth;
    }
    static create(modelMatrix, size, numberOfSegments) {
        let cube = Cube.create(modelMatrix, size, numberOfSegments);
        let labyrinth = generateLabyrinth(numberOfSegments);
        let mazeCube = new MazeCube(cube.geo, cube.getModelMatrix(), cube.size, cube.numSegments, labyrinth);
        insetFaces(cube.geo, numberOfSegments, size, labyrinth);
        mazeCube.segments = cube.segments;
        return mazeCube;
    }

}

class Player extends Cube {
    constructor(geo, modelMatrix, size, numSegments, mazeCube, gameWonCallback) {
        super(geo, modelMatrix, size, numSegments);
        this.setParent(mazeCube);
        this.side = null;
        this.nthSegment = null;
        this.currSegment = null;
        this.localCoordSys = null;
        this.movementDirections = null;
        this.moving = false;
        this.gameWonCallback = gameWonCallback;
    }
    static create(mazeCube, numSegments, gameWonCallback) {
        let size = mazeCube.size / mazeCube.numSegments;
        let geo = glance.createBox('player-geo', {
            width: size,
            height: size,
            depth: size,
            widthSegments: numSegments,
            heightSegments: numSegments,
            depthSegments: numSegments
        });
        let player = new Player(geo, glance.Mat4.identity(), size, numSegments, mazeCube, gameWonCallback);

        player.initSegment();
        player.initModelMatrix();
        player.initLocalCoordSys();
        player.getSegmentByPos(player.getModelMatrix().getTranslation());  // for debugging
        return player;
    }
    initSegment() {
        let nth = convertSegmentToSideNth(Math.floor(this.numSegments/2), Math.floor(this.numSegments/2), this.parent.numSegments)
        let side = 5 // labyrinth hardcoded to start here
        this.currSegment = this.parent.getSegment(side, nth);
        this.side = side;
        this.nthSegment = nth;
    }
    initModelMatrix() {
        let offset = this.currSegment.normal.clone().scale(this.size / 2);
        let pos = this.currSegment.center.clone();
        pos.sub(offset);  // subtract, to reach the insetted surface
        this.updateModelMatrix(glance.Mat4.fromTranslation(pos));
    }
    initLocalCoordSys() {
        // should have just used a Mat3, but too lazy to change it now
        let currentOutVec = this.currSegment.normal.clone();
        this.localCoordSys =
        {
            "x": null,
            "y": null,
            "z": null, 
        }
        this.localCoordSys["z"] = currentOutVec;
        this.localCoordSys["y"] = glance.Vec3.fromArray([0, 1, 0])
        this.localCoordSys["x"] = this.localCoordSys["y"].clone().rotateAround(this.localCoordSys["z"], -Math.PI / 2)
    }
    updateLocalCoordSys(rotationAxis, newForwardVec) {
        if (this.localCoordSys === null) return;
        this.localCoordSys["y"] = newForwardVec;
        this.localCoordSys["x"] = this.localCoordSys["y"].clone().rotateAround(this.localCoordSys["z"], -Math.PI / 2)
        for (let key in this.localCoordSys) {
            this.localCoordSys[key].rotateAround(rotationAxis, Math.PI / 2);
        }
    }
    getPositionBySeg(side, nthSegment)  // TODO: Do we need this?
    {
        let segment = this.parent.getSegment(side, nthSegment);
        let center = glance.Vec3.fromArray(segment.center);
        let offset = glance.Vec3.fromArray(segment.normal).scale(this.size / 2);
        center.add(offset);
        return center;
    }
    getSegmentByPos(pos) {
        // calc corresponding parent cube segment center vertex position
        let currNormal = this.localCoordSys["z"].clone().rotateMat4(this.getModelMatrix());

        let reverseOffset = currNormal.clone().scale(-this.size / 2);
        pos.add(reverseOffset);  // from center of player to surface of maze cube

        let parentSegments = this.parent.getSegments();
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < parentSegments[i].length; j++) {
                let segment = parentSegments[i][j];
                let center = glance.Vec3.fromArray(segment.center);
                if (center.equals(pos)) {
                    let nthSegment = getSegmentIndex(i, j, this.parent.numSegments);
                    return [segment, nthSegment, i, j];
                }
            }
        }

    }
    isNotWall(side, coord) {
        return this.parent.labyrinth[side].some(entry => entry[0] === coord[0] && entry[1] === coord[1]);
    }
    move(direction, rotAxis) {
        if (this.moving) return;
        this.moving = true;

        // implementing animation
        let offset = direction.clone().scale(this.size);
        let startingSegment = this.parent.getSegment(this.side, this.nthSegment);  // get the segment without updated positions

        // calc what the position would be
        let segCenter = startingSegment.center.clone()
        let pos = segCenter.add(this.currSegment.normal.clone().scale(this.size/2))
        let segment = this.getSegmentByPos(pos.add(offset));  // get the segment pos with updated positions
        let converted = convertSegmentToXY(segment[3], this.parent.numSegments)
        let edge = false;
        let animationDirection = direction.clone()

        if (!this.isNotWall(segment[2], converted)) {
            this.moving = false;
            return;
        }
        if (converted[0] >= this.parent.numSegments - 1 || converted[1] >= this.parent.numSegments - 1 || converted[0] < 1 || converted[1] < 1) {
            offset.add(this.localCoordSys["z"].clone().scale(-this.size));  // add a move inward towards the cube, to reach surface again and create the wrapping effect            
            this.updateLocalCoordSys(rotAxis, direction.clone())
            edge = true;
        }

        let final = glance.Mat4.fromTranslation(offset).mul(this.getModelMatrixNoParent());
        this.animate(startingSegment, animationDirection, rotAxis, edge, final);

        // calulate the current segment 
        segment = this.getSegmentByPos(final.getTranslation()
            .add(this.localCoordSys["z"]
            .clone()
            .scale(this.size))
        );

        this.side = segment[2];
        this.nthSegment = segment[3];
        this.currSegment = segment[0];
        let xy = convertSegmentToXY(this.nthSegment, this.parent.numSegments);
        if (this.side === 4 && xy[0] === Math.ceil(this.parent.numSegments / 2)-1 && xy[1] === Math.ceil(this.parent.numSegments / 2)-1) {
            this.gameWonCallback();
        }

    }
    moveForward() {
        this.move(this.localCoordSys["y"].clone(), this.localCoordSys["x"].clone().scale(-1))
    }
    moveBackward() {
        this.move(this.localCoordSys["y"].clone().scale(-1), this.localCoordSys["x"].clone())
    }
    moveLeft() {
        this.move(this.localCoordSys["x"].clone().scale(-1), this.localCoordSys["y"].clone().scale(-1))
    }
    moveRight() {
        this.move(this.localCoordSys["x"].clone(), this.localCoordSys["y"].clone())
    }
    animate(startingSegment, direction, rotAxis, edge = false, final) {
        const totalRotation = edge ? Math.PI : Math.PI / 2; // 90 degrees in radians
        const baseDur = 200 // Total duration of the animation in milliseconds
        const dur = edge ? baseDur * 2 : baseDur; // take longer when wrapping around an edge
        const frameRate = 120; // Frames per second
        const interval = 1000 / frameRate; // Interval in milliseconds
        const totalFrames = Math.ceil((dur / 1000) * frameRate);

        let currPos = this.getModelMatrixNoParent().getTranslation();
        let insetSegmentCenter = glance.Vec3.fromArray(startingSegment.center).sub(glance.Vec3.fromArray(startingSegment.normal).scale(this.size));
        let halfwayPoint = insetSegmentCenter.add(direction.clone().scale(this.size / 2));

        let offset = halfwayPoint.clone().sub(currPos);
        let reverseOffset = offset.clone().scale(-1);

        let currentFrame = 0;
        let previousRotation = 0;
        // Cubic ease in-out function
        function easeInOutCubic(t) {
            return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }

        const animationStep = () => {
            if (currentFrame < totalFrames) {
                // Calculate the eased progress
                const progress = currentFrame / totalFrames;
                const easedProgress = easeInOutCubic(progress);

                // Calculate the current rotation based on the eased progress
                const currentRotation = totalRotation * easedProgress;

                // Calculate the rotation increment
                const rotationIncrement = currentRotation - previousRotation;

                // Translate cube to the rotation axis
                this.updateModelMatrix(glance.Mat4.fromTranslation(offset));

                // Apply the current eased rotation
                this.updateModelMatrix(glance.Mat4.fromRotation(rotAxis, rotationIncrement));

                // Translate cube back to its original position
                this.updateModelMatrix(glance.Mat4.fromTranslation(reverseOffset));

                // Update the stored rotation angle
                previousRotation = currentRotation;

                currentFrame++;
            } else {
                clearInterval(animationInterval);
                this.setModelMatrix(final);  // really ugly work around that breaks any parenting, but c'est la vie
                this.moving = false;  // only allow next movement after animation is done
            }
        };
        const animationInterval = setInterval(animationStep, interval);
    }

}


