import { Mat3, Vec2, Vec3, Quat, } from "../glance/js/math/index.js";
export { insetFaces, };


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
            const numberTrianglesOneSide = (numberOfSegments ** 2) * 2;
            const triangleIndex = numberTrianglesOneSide * faces[i][0] + faces[i][1] * numberOfSegments * 2 + faces[i][2] * 2;
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
        const v1 = { x: vertex2.x - vertex1.x, y: vertex2.y - vertex1.y, z: vertex2.z - vertex1.z };
        const v2 = { x: vertex3.x - vertex1.x, y: vertex3.y - vertex1.y, z: vertex3.z - vertex1.z };

        // Calculate the cross product of v1 and v2
        const normal = {
            x: v1.y * v2.z - v1.z * v2.y,
            y: v1.z * v2.x - v1.x * v2.z,
            z: v1.x * v2.y - v1.y * v2.x
        };

        // Normalize the normal vector
        const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);
        normal.x /= length;
        normal.y /= length;
        normal.z /= length;

        return normal;
    }

    // Inset a triangle face
    function insetFace(triangleIndex) {
        const originalVerticesPositions = getVertexPositions(triangleIndex);
        const originalVertices = [indices[3 * triangleIndex], indices[3 * triangleIndex + 1], indices[3 * triangleIndex + 2]]
        const faceNormal = getFaceNormal(triangleIndex);
        const length = positions.length;

        // Add new inset vertices
        for (let i = 0; i < 3; i++) {
            positions.push(originalVerticesPositions[i].x - faceNormal.x * inset, originalVerticesPositions[i].y - faceNormal.y * inset, originalVerticesPositions[i].z - faceNormal.z * inset)
            normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
            // Use the same uvs as the original vertices
            const uvs = new Vec2(texCoords[2 * originalVertices[i]], texCoords[2 * originalVertices[i] + 1])
            texCoords.push(uvs.x, uvs.y)
        }
        console.log(positions);
        // Replace original vertices by insetVertices
        const insetVertices = [length / 3, length / 3 + 1, length / 3 + 2]
        indices.splice(3 * triangleIndex, 3, insetVertices[0], insetVertices[1], insetVertices[2])

        // createWalls(originalVertices, insetVertices)
        return {originalVertices, insetVertices};
    }

    function createWalls(topFaceVertices, bottomFaceVertices, indicesShift) {
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
                if (indexTuples[j].includes(topFaceVertices[i]) && indexTuples[j].includes(topFaceVertices[(i + 1) % 3])) {
                    drawTriangle = true;
                    break;
                }
            }

            // Only draw the triangle if it is on the edge of inset vertices (not between two inset triangles)
            if (drawTriangle) {
                indices.splice(indicesShift, 0, topFaceVertices[i], topFaceVertices[(i + 1) % 3], bottomFaceVertices[i])
                indices.splice(indicesShift, 0, topFaceVertices[(i + 1) % 3], bottomFaceVertices[(i + 1) % 3], bottomFaceVertices[i])
            }
        }
    }

    const triangleIndices = getTriangleIndices();
    let originalVertices = [];
    let insetVertices = [];

    // Create inset faces and remove original ones
    for (let i = 0; i < triangleIndices.length; i++) {
        const triangleIndex = triangleIndices[i];
        const indicesLength = indices.length;

        // Store original and inset vertices
        const temp = insetFace(triangleIndex);
        originalVertices.push(temp.originalVertices);
        insetVertices.push(temp.insetVertices);

        // Update the faces array to reflect the new indices
        const diff = indices.length - indicesLength;
        for (let j = 0; j < triangleIndices.length; j++) {
            faces[j] += diff / 3;
        }
    }
    // Create walls at the edge of the inset faces
    for (let i = 0; i < faces.length; i++) {
        createWalls(originalVertices[i], insetVertices[i], faces.length * 3);
    }
}