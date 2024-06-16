import * as glance from '../glance/js/index.js';
import * as amazed from './amazed_utils.js';

// Get the WebGL context
const canvas = document.getElementById('canvas');
const gl = glance.getContext(canvas);

// Basic render loop wrapper
function setRenderLoop(callback) {
    function renderLoop(time) {
        callback(time);
        requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
}

// Resize callback
let _resizeCallback = null;
canvas.addEventListener("resize", () => {
    if (_resizeCallback) {
        _resizeCallback(canvas.clientWidth, canvas.clientHeight);
    }
});
function onResize(callback) {
    _resizeCallback = callback;
    _resizeCallback(canvas.clientWidth, canvas.clientHeight);
}

function onMouseDrag(callback) {
    let isDragging = false;

    canvas.addEventListener('mousedown', () => {
        isDragging = true;
    });

    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });

    canvas.addEventListener('mousemove', (e) => {
        if (isDragging) {
            callback(e);
        }
    });
}

function onMouseWheel(callback) {
    canvas.addEventListener('wheel', (e) => {
        callback(e);
    });
}

// Shaders ///////////////////////////////////////////////////////////////

// Vertex shader source code
const vertexShaderSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;

    in vec3 a_pos;
    in vec3 a_normal;
    in vec2 a_texCoord;

    out vec3 f_worldPos;
    out vec3 f_normal;
    out vec2 f_texCoord;

    void main() {
        vec4 worldPos = u_modelMatrix * vec4(a_pos, 1.0);
        gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
        f_worldPos = worldPos.xyz;
        f_normal = (u_modelMatrix * vec4(a_normal, 0.0)).xyz;
        f_texCoord = a_texCoord;
    }
`;

// Fragment shader source code
const fragmentShaderSource = `#version 300 es
    precision mediump float;

    uniform sampler2D u_texDiffuse;

    in vec3 f_worldPos;
    in vec3 f_normal;
    in vec2 f_texCoord;

    uniform float u_threshold1;
    uniform float u_threshold2;

    out vec4 o_fragColor;

    void main() {
        vec3 normal = normalize(f_normal);
        vec3 texDiffuse = texture(u_texDiffuse, f_texCoord).rgb;

        vec3 color1 = vec3(.3, .3, .7);
        vec3 color2 = vec3(.4, .4, .6);
        vec3 color3 = vec3(.6, .6, .8);

        vec3 temp = f_worldPos * f_normal;
        vec3 finalColor;
        
        if (temp.x + temp.y + temp.z == u_threshold1) {
            finalColor = color1;
        } else if (temp.x + temp.y + temp.z == u_threshold2) {
            finalColor = color3;
        } else {
            finalColor = texDiffuse;
        }

        o_fragColor = vec4(finalColor, 1.0);
    }
`;

// Create the labyrinth shader
const labyShader = glance.createShader(gl, "my-shader", vertexShaderSource, fragmentShaderSource, {
    u_viewMatrix: glance.Mat4.fromTranslation(0, 0, -2),
    u_projectionMatrix: glance.Mat4.perspective((60 / 180) * Math.PI, gl.canvas.width / gl.canvas.height, 0.1, 10),
    u_texDiffuse: 0,
});

// Data //////////////////////////////////////////////////////////////////
const numberOfSegments = 21; // should be uneven and > 5 -> otherwise conditions for labyrinth generation are not met
const cubeSize = 1;

// Create the cube labyrinth
const cube = glance.createBox('cube-geo', { width: cubeSize, height: cubeSize, depth: cubeSize, widthSegments: numberOfSegments, heightSegments: numberOfSegments, depthSegments: numberOfSegments });
const labyrinth = amazed.generateLabyrinthCube(numberOfSegments);
amazed.insetFaces(cube, numberOfSegments, cubeSize, labyrinth);

// Create the index buffer object for the labyrinth
const labyIBO = glance.createIndexBuffer(gl, cube.indices);

// Create the attribute buffer object for the labyrinth
const labyABO = glance.createAttributeBuffer(gl, 'laby-abo', {
    a_pos: { data: cube.positions, height: 3 },
    a_normal: { data: cube.normals, height: 3 },
    a_texCoord: { data: cube.texCoords, height: 2 },
});

// Create the vertex array object for the labyrinth
const labyVAO = glance.createVAO(gl, 'laby-vao', labyIBO, glance.buildAttributeMap(labyShader, labyABO));

// Load texture
const labyTextureDiffuse = await glance.loadTextureNow(gl, './assets/uv_test.jpg');

// Create the draw call for the labyrinth
const labyDrawCall = glance.createDrawCall(gl, labyShader, labyVAO, {
    textures: [[0, labyTextureDiffuse]],
    cullFace: gl.BACK,
    depthTest: gl.LESS,
});

let pan = 0;
let tilt = 0;
let zoom = 3;

// Rendering ////////////////////////////////////////////////////////////
const viewMatrixUniform = gl.getUniformLocation(labyShader.glObject, "u_viewMatrix");
const viewMatrix = glance.Mat4.fromTranslation(0, 0, -zoom);
const uThreshold1 = gl.getUniformLocation(labyShader.glObject, "u_threshold1");
const uThreshold2 = gl.getUniformLocation(labyShader.glObject, "u_threshold2");
gl.useProgram(labyShader.glObject);
gl.uniform1f(uThreshold1, cubeSize / 2 - cubeSize / numberOfSegments);
gl.uniform1f(uThreshold2, cubeSize / 2);
gl.uniformMatrix4fv(viewMatrixUniform, false, viewMatrix);

function render(time) {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Update view matrix
    viewMatrix.reset();
    viewMatrix.translateZ(-zoom);
    viewMatrix.rotateX(tilt);
    viewMatrix.rotateY(pan);
    gl.useProgram(labyShader.glObject);
    
    gl.uniformMatrix4fv(viewMatrixUniform, false, viewMatrix);

    glance.performDrawCall(gl, labyDrawCall, time);
}

setRenderLoop(render);

onMouseDrag((e) => {
    const cameraSpeed = 0.007;
    const halfPi = Math.PI / 2;
    pan += e.movementX * cameraSpeed;
    tilt = glance.clamp(tilt + e.movementY * cameraSpeed, -halfPi, halfPi);
});

onMouseWheel((e) => {
    const zoomSpeed = 0.2;
    const minZoom = 1.5;
    const maxZoom = 5;
    zoom = glance.clamp(zoom * (1 + Math.sign(e.deltaY) * zoomSpeed), minZoom, maxZoom);
});

onResize(() => {
    gl.canvas.width = gl.canvas.offsetWidth;
    gl.canvas.height = gl.canvas.offsetHeight;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.useProgram(labyShader.glObject);
    const projectionUniform = gl.getUniformLocation(labyShader.glObject, 'u_projectionMatrix');
    gl.uniformMatrix4fv(projectionUniform, false, glance.Mat4.perspective((60 / 180) * Math.PI, gl.canvas.width / gl.canvas.height, 0.1, 10));
});
