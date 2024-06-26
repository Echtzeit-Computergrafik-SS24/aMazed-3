import * as glance from '../glance/js/index.js';
import { generateLabyrinth } from "./generate_labyrinth.js";
import { insetFaces } from "./inset_faces.js";
export { GameObject, Cube, MazeCube, Player };

// some methods for segmented objects
function getSegmentIndex(side, segment, numSegments)
{
    return side*numSegments**2 + segment;
}
function getUniqueSegmentIndices(segment, indices)
{
    // filter out any repeat indices
    return new Set(indices.slice(segment * 6, segment * 6 + 6))
}
function getSegmentVerts(indices, positions)
{
    let segmentVerts = [];
    indices.forEach((index) => {
        segmentVerts.push(positions.slice(index * 3, index * 3 + 3));
    });
    return segmentVerts;
}
function getSegmentNormals(indices, normals)
{
    let segmentNormals = [];
    indices.forEach((index) => {
        segmentNormals.push(normals.slice(index * 3, index * 3 + 3));
    });
    return segmentNormals;
}
function getSegmentCenter(segmentVerts)
{
    let center = glance.Vec3.zero();
    segmentVerts.forEach(coord => center.add(glance.Vec3.fromArray(coord).scale(1 / segmentVerts.length)));
    return center.toArray();
}
function getSegment(geo, side, nthSegment)
{
    let segment = getSegmentIndex(side, nthSegment, geo.widthSegs);  // assumes, that the parent object has equal width, height and depth segments
    let segIndices = getUniqueSegmentIndices(segment, geo.indices);
    let segPositions = getSegmentVerts(segIndices, geo.positions);
    let segNormals = getSegmentNormals(segIndices, geo.normals);
    return {'indices': segIndices, 'positions': segPositions, 'normals': segNormals};
}


// goal of this class is to add further functionality to geometries
// point of this class are parent/child relationships, not making a wrapper for Mat4 class. 
// So for changing model matrix: get it, change it with Mat4 methods and set it
// note for myself: implementing Mat4 methods makes no sense, as stringing them together requires returning mat4 which means i can't update children
class GameObject {
    #modelMatrix
    constructor(geo, modelMatrix)
    {
        this.geo = geo;
        this.#modelMatrix = modelMatrix;
        this.parent = null;
        this.parentConfig = null;
        this.children = [];
    }
    setParent(parent, parentConfig={rotate: true, position: true, scale: true})
    {
        if (this.parent === parent || parent === this) return;  // prevent adding the same child twice to same parent or being its own parent
        this.parentConfig = parentConfig;
        this.parent = parent;
        this.parent.children.push(this);
    }
    getModelMatrix()
    {
        if (this.parent === null) return this.#modelMatrix.clone();  // if there is no parent, just return the model matrix
        else return this.parent.getModelMatrix().mul(this.#modelMatrix);  // if there is a parent, return the parent's model matrix multiplied with the child's model matrix
    }
    getModelMatrixNoParent()
    {
        return this.#modelMatrix.clone();
    }
    updateModelMatrix(update, isInitialUpdate=true)  // update being a Mat4 that will be multiplied with the current model matrix
    {
        this.#modelMatrix = this.#modelMatrix.mul(update);
    }
    setModelMatrix(newModelMatrix)
    {
        this.#modelMatrix = newModelMatrix;
    }
    getCurrentPositions()
    {
        let currentPositions = [];
        for (let i = 0; i < this.geo.positions.length/3; i++)
        {
            let curr = i * 3;
            let position = glance.Vec3.fromArray(this.geo.positions.slice(curr, curr + 3));
            position.applyMat4(this.#modelMatrix);
            currentPositions.push(...position.toArray());
        }
        return currentPositions;
    }
    getCurrentNormals()
    {
        let currentNormals = [];
        for (let i = 0; i < this.geo.normals.length/3; i++)
        {
            let curr = i * 3;
            let normal = glance.Vec3.fromArray(this.geo.normals.slice(curr, curr + 3));
            normal.rotateMat4(this.#modelMatrix);
            normal.normalize();
            // console.log(normal.toArray())
            currentNormals.push(...normal.toArray());
        }
        return currentNormals;
    }
}


class Cube extends GameObject {
    constructor(geo, modelMatrix, size, numSegments)
    {
        super(geo, modelMatrix);
        this.size = size;
        this.numSegments = numSegments;
        this.segments = [];  // 2D array, 1st dimension is the side, 2nd dimension is the segment
    }
    static create(modelMatrix, size, numSegments)
    {
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
    initSegments()
    {
        for (let i = 0; i < 6; i++)
        {
            let side = [];
            for (let j = 0; j < this.numSegments**2; j++)
            {
                side.push(this.calcSegment(i, j));
            }
            this.segments.push(side);
        }
    }
    getSegments()
    {
        return this.segments;
    }
    getSegment(side, nthSegment)
    {
        return this.segments[side][nthSegment];
    }
    getCurrentSegments()
    {
        let currentSegments = [];
        for (let i = 0; i < this.segments.length; i++)
        {
            let side = [];
            for (let j = 0; j < this.segments[i].length; j++)
            {
                let segment = this.segments[i][j];
                let indices = segment.indices;
                let positions = getSegmentVerts(indices, this.getCurrentPositions());
                let normals = getSegmentNormals(indices, this.getCurrentNormals());
                let center = getSegmentCenter(positions);
                side.push({'indices': indices, 'positions': positions, 'normals': normals, 'center': center});
            }
            currentSegments.push(side);
        }
        return currentSegments;
    }
    calcSegment(side, nthSegment)
    {
        const segIdx = getSegmentIndex(side, nthSegment, this.numSegments);
        const segIndices = getUniqueSegmentIndices(segIdx, this.geo.indices);
        const segPositions = getSegmentVerts(segIndices, this.getCurrentPositions());
        const segNormals = getSegmentNormals(segIndices, this.getCurrentNormals());
        const segCenter = getSegmentCenter(segPositions);

        return {
            'indices': segIndices, 
            'positions': segPositions, 
            'normals': segNormals,
            'center': segCenter
        };
    }
    getCubeSideNormals()
    {
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
    constructor(geo, modelMatrix, size, numSegments)
    {
        super(geo, modelMatrix, size, numSegments);

    }
    static create(modelMatrix, size, numberOfSegments)
    {
        let cube = Cube.create(modelMatrix, size, numberOfSegments);
        let labyrinth = generateLabyrinth(numberOfSegments);
        insetFaces(cube.geo, numberOfSegments, size, labyrinth);
        let mazeCube = new MazeCube(cube.geo, cube.getModelMatrix(), cube.size, cube.numSegments);
        mazeCube.initSegments();
        return mazeCube;
    }

}

class Player extends Cube {
    constructor(geo, modelMatrix, size, numSegments, mazeCube)
    {
        super(geo, modelMatrix, size, numSegments);
        this.setParent(mazeCube);
        this.side = null;
        this.nthSegment = null;
        this.currSegment = null;
        this.directionMapping = null;
        this.initialMM = null;
        this.moving = false;
    }
    static create(mazeCube, side, nthSegment, numSegments)
    {
        let size = mazeCube.size/mazeCube.numSegments;
        // let size = mazeCube.size/mazeCube.numSegments * 1.5;
        let geo = glance.createBox('player-geo', {
            width: size, 
            height: size, 
            depth: size, 
            widthSegments: numSegments,
            heightSegments: numSegments, 
            depthSegments: numSegments
            });
        let player = new Player(geo, glance.Mat4.identity(), size, numSegments, mazeCube);
        player.side = side;
        player.nthSegment = nthSegment;
        player.initSegment(side, nthSegment);
        player.initModelMatrix();
        player.initOrientation();
        player.getSegmentByPos(player.getModelMatrix().getTranslation());  // for debugging
        return player;
    }
    initSegment(side, nthSegment)
    {
        this.currSegment = this.parent.getSegment(side, nthSegment);
    }
    initModelMatrix()
    {
        let offset = glance.Vec3.fromArray(this.currSegment.normals[0]).scale(this.size/2);
        this.initNormal = glance.Vec3.fromArray(this.currSegment.normals[0]);
        let pos = glance.Vec3.fromArray(this.currSegment.center);
        pos.add(offset); 
        this.updateModelMatrix(glance.Mat4.fromTranslation(pos));
        this.initialMM = this.getModelMatrixNoParent().clone();
    }
    initOrientation()
    {
        let cubeSideNormals = this.parent.getCubeSideNormals()
        let possibleDirections = [];
        let segNormals = glance.Vec3.fromArray(this.currSegment.normals[0]);  // the normal of the of the cubeside the player is currently on
        let excluded = [segNormals, segNormals.clone().scale(-1)]
        for (let i = 0; i < cubeSideNormals.length; i++)
        {
            let normal = cubeSideNormals[i];
            if (!normal.equals(excluded[0]) && !normal.equals(excluded[1]))
            {
                possibleDirections.push(normal.normalize())
            }
        }
        excluded[0].normalize()
        let tmp = excluded[0].toArray().map(value => (value >= 1 || value <= -1) ? value : 0);
        let rotationAxis = glance.Vec3.fromArray(tmp)

        for (let i = 0; i < possibleDirections.length; i++)
        {
            let tmp = possibleDirections[i].toArray()
            let updated = tmp.map(value => (value >= 1 || value <= -1) ? value : 0);
            possibleDirections[i] = glance.Vec3.fromArray(updated)
        }
        let directionMapping = 
        {
            "forward": null,
            "backward": null,
            "left": null,
            "right": null
        }
        directionMapping["orthogonal"] = rotationAxis.clone();
        directionMapping["forward"] = possibleDirections[0].clone()
        directionMapping["right"] = directionMapping["forward"].clone().rotateAround(rotationAxis, Math.PI/2)
        directionMapping["backward"] = directionMapping["right"].clone().rotateAround(rotationAxis, Math.PI/2)
        directionMapping["left"] = directionMapping["backward"].clone().rotateAround(rotationAxis, Math.PI/2)
        this.directionMapping = directionMapping;
        console.log(this.directionMapping)

    }
    updateOrientation(rotationAxis, angle)
    {
        if (this.directionMapping === null) return;
        this.directionMapping["orthogonal"].rotateAround(rotationAxis, angle);
        this.directionMapping["forward"].rotateAround(rotationAxis, angle);
        this.directionMapping["right"].rotateAround(rotationAxis, angle);
        this.directionMapping["backward"].rotateAround(rotationAxis, angle);
        this.directionMapping["left"].rotateAround(rotationAxis, angle);
    }
    getPositionBySeg(side, nthSegment)  // TODO: Do we need this?
    {
        let segment = this.parent.getSegment(side, nthSegment);
        let center = glance.Vec3.fromArray(segment.center);
        let offset = glance.Vec3.fromArray(segment.normals[0]).scale(this.size/2);
        center.add(offset);
        return center;
    }
    getSegmentByPos(pos)
    {
        // calc corresponding parent cube segment center vertex position
        let currNormal = this.directionMapping["orthogonal"].clone().rotateMat4(this.getModelMatrix());

        let reverseOffset = currNormal.clone().scale(-this.size/2);
        pos.add(reverseOffset);  // from center of player to surface of maze cube
        
        let parentSegments = this.parent.getCurrentSegments();
        for (let i = 0; i < 6; i++)
        {
            for (let j = 0; j < parentSegments[i].length; j++)
            {
                let segment = parentSegments[i][j];
                let center = glance.Vec3.fromArray(segment.center);
                if (center.equals(pos))
                {
                    let nthSegment = getSegmentIndex(i, j, this.parent.numSegments);
                    return [segment, nthSegment, i, j];
                }
            }
        }

    }
    moveForward()
    {
        if (this.moving) return;
        this.moving = true;

        // implementing animation
        let offset = this.directionMapping["forward"].clone().scale(this.size);
        let startingSegment = this.parent.getSegment(this.side, this.nthSegment);  // get the segment without updated positions
        
        // calc what the position would be
        let pos = offset.clone().applyMat4(this.getModelMatrix())

        let segment = this.getSegmentByPos(pos);  // get the segment pos with updated positions 
        let edge = false;
        let animationDirection = this.directionMapping["forward"].clone()
        let rotAxis = this.directionMapping["right"].clone()
        if (segment === undefined)  // player would leave cube surface
        {
            console.log("edge")
            offset.add(this.directionMapping["orthogonal"].clone().scale(-this.size));  // add a move inward towards the cube, to reach surface again and create the wrapping effect
            this.updateOrientation(this.directionMapping["right"].clone(), Math.PI/2);  // update orientation coodinate system as we are now on a different side
            edge = true;
        }
        let final = glance.Mat4.fromTranslation(offset).mul(this.getModelMatrixNoParent());
        this.animate(startingSegment, animationDirection, rotAxis, edge, final);

        // calulate the current segment 
        segment = this.getSegmentByPos(offset.clone().applyMat4(this.getModelMatrix()));  // using modelMatrix because we need current global pos
        this.side = segment[2];
        this.nthSegment = segment[3];
        this.currSegment = segment[0];

        console.log(segment)
        
    }
    moveBackward()
    {
        if (this.moving) return;
        this.moving = true;

        // implementing animation
        let offset = this.directionMapping["backward"].clone().scale(this.size);
        let startingSegment = this.parent.getSegment(this.side, this.nthSegment);  // get the segment without updated positions
        
        // calc what the position would be
        let pos = offset.clone().applyMat4(this.getModelMatrix())

        let segment = this.getSegmentByPos(pos);  // get the segment pos with updated positions 
        let edge = false;
        let animationDirection = this.directionMapping["backward"].clone()
        let rotAxis = this.directionMapping["left"].clone()
        if (segment === undefined)  // player would leave cube surface
        {
            console.log("edge")
            offset.add(this.directionMapping["orthogonal"].clone().scale(-this.size));  // add a move inward towards the cube, to reach surface again and create the wrapping effect
            this.updateOrientation(this.directionMapping["left"].clone(), Math.PI/2);  // update orientation coodinate system as we are now on a different side
            edge = true;
        }
        let final = glance.Mat4.fromTranslation(offset).mul(this.getModelMatrixNoParent());
        this.animate(startingSegment, animationDirection, rotAxis, edge, final);

        // calulate the current segment 
        segment = this.getSegmentByPos(offset.clone().applyMat4(this.getModelMatrix()));  // using modelMatrix because we need current global pos
        this.side = segment[2];
        this.nthSegment = segment[3];
        this.currSegment = segment[0];

        console.log(segment)
    }
    moveLeft()
    {
        if (this.moving) return;
        this.moving = true;

         // implementing animation
         let offset = this.directionMapping["right"].clone().scale(this.size);  // don't know why, but left and right switched :D
         let startingSegment = this.parent.getSegment(this.side, this.nthSegment);  // get the segment without updated positions
         
         // calc what the position would be
         let pos = offset.clone().applyMat4(this.getModelMatrix())
 
         let segment = this.getSegmentByPos(pos);  // get the segment pos with updated positions 
         let edge = false;
         let animationDirection = this.directionMapping["right"].clone()
         let rotAxis = this.directionMapping["backward"].clone()
         if (segment === undefined)  // player would leave cube surface
         {
             console.log("edge")
             offset.add(this.directionMapping["orthogonal"].clone().scale(-this.size));  // add a move inward towards the cube, to reach surface again and create the wrapping effect
             this.updateOrientation(this.directionMapping["backward"].clone(), Math.PI/2);  // update orientation coodinate system as we are now on a different side
             edge = true;
         }
         let final = glance.Mat4.fromTranslation(offset).mul(this.getModelMatrixNoParent());
         this.animate(startingSegment, animationDirection, rotAxis, edge, final);
 
         // calulate the current segment 
         segment = this.getSegmentByPos(offset.clone().applyMat4(this.getModelMatrix()));  // using modelMatrix because we need current global pos
         this.side = segment[2];
         this.nthSegment = segment[3];
         this.currSegment = segment[0];
 
         console.log(segment)

    }
    moveRight()
    {   
        if (this.moving) return;
        this.moving = true;

         // implementing animation
         let offset = this.directionMapping["left"].clone().scale(this.size);  // don't know why, but left and right switched :D
         let startingSegment = this.parent.getSegment(this.side, this.nthSegment);  // get the segment without updated positions
         
         // calc what the position would be
         let pos = offset.clone().applyMat4(this.getModelMatrix())
 
         let segment = this.getSegmentByPos(pos);  // get the segment pos with updated positions 
         let edge = false;
         let animationDirection = this.directionMapping["left"].clone()
         let rotAxis = this.directionMapping["forward"].clone()
         if (segment === undefined)  // player would leave cube surface
         {
             console.log("edge")
             offset.add(this.directionMapping["orthogonal"].clone().scale(-this.size));  // add a move inward towards the cube, to reach surface again and create the wrapping effect
             this.updateOrientation(this.directionMapping["forward"].clone(), Math.PI/2);  // update orientation coodinate system as we are now on a different side
             edge = true;
         }
         let final = glance.Mat4.fromTranslation(offset).mul(this.getModelMatrixNoParent());
         this.animate(startingSegment, animationDirection, rotAxis, edge, final);
 
         // calulate the current segment 
         segment = this.getSegmentByPos(offset.clone().applyMat4(this.getModelMatrix()));  // using modelMatrix because we need current global pos
         this.side = segment[2];
         this.nthSegment = segment[3];
         this.currSegment = segment[0];
 
         console.log(segment)
    }
    animate(startingSegment, direction, rotAxis, edge=false, final)
    {
        const totalRotation = edge ? Math.PI : Math.PI/2; // 90 degrees in radians

        const baseDur = 100 // Total duration of the animation in milliseconds
        const dur = edge ? baseDur*2: baseDur; // take longer when wrapping around an edge
        const frameRate = 120; // Frames per second
        const interval = 1000 / frameRate; // Interval in milliseconds
        const totalFrames = Math.ceil((dur / 1000) * frameRate);

        let currPos = this.getModelMatrixNoParent().getTranslation();
        console.log("startingSegment", startingSegment.center)
        let halfwayPoint = glance.Vec3.fromArray(startingSegment.center).add(direction.clone().scale(this.size/2));
        console.log("halfwayPoint", halfwayPoint)
        
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

    

