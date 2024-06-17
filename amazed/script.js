import * as glance from "../glance/js/index.js";
import * as amazed from "./amazed.js";
const { Vec3, Mat4 } = glance;

// Get the WebGL context
const glCanvas = document.getElementById("canvas");
const gl = glance.getContext(glCanvas);

// Basic render loop wrapper.
function setRenderLoop(callback) {
  function renderLoop(time) {
    callback(time);
    requestAnimationFrame(renderLoop);
  }
  requestAnimationFrame(renderLoop);
}

// Resize callback
let _resizeCallback = null;
function onResizeInternal() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  glCanvas.width = width;
  glCanvas.height = height;
  gl.viewport(0, 0, width, height);
  if (_resizeCallback) {
    _resizeCallback(width, height);
  }
}
onResizeInternal();
window.addEventListener("resize", onResizeInternal);
function onResize(callback) {
  _resizeCallback = callback;
  _resizeCallback(window.innerWidth, window.innerHeight);
}

// Mouse event handling
function onMouseDrag(callback) {
  let isDragging = null;
  glCanvas.addEventListener("mousedown", () => {
    isDragging = true;
  });
  glCanvas.addEventListener("mousemove", (e) => {
    if (isDragging) {
      callback(e);
    }
  });
  glCanvas.addEventListener("mouseup", () => {
    isDragging = false;
  });
}

function onMouseWheel(callback) {
    glCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    callback(e);
  });
}


// Game Code Start /////////////////////////////////////////////////////////

// =====================================================================
// Constants
// =====================================================================

const fov = Math.PI / 4;
const nearPlane = 0.1;
const farPlane = 14;

const cameraSpeed = 0.003;
const zoomSpeed = 0.2;
const minZoom = 1.5;
const maxZoom = 10.0;
const minPan = -Infinity;
const maxPan = Infinity;
const minTilt = Math.PI / -2;
const maxTilt = Math.PI / 2;

const lightDistance = 0.25;
const lightRadius = 2.;
const lightSpeed = 0.0002;

// =====================================================================
// Game State
// =====================================================================

/// The user can orbit the camera around the world origin and zoom in and out.
let pan = 0;
let tilt = 0;
let zoom = 4.5;

onMouseDrag((e) => {
  pan = glance.clamp(pan - e.movementX * cameraSpeed, minPan, maxPan);
  tilt = glance.clamp(tilt - e.movementY * cameraSpeed, minTilt, maxTilt);
});

onMouseWheel((e) => {
  const factor = 1 + Math.sign(e.deltaY) * zoomSpeed;
  zoom = glance.clamp(zoom * factor, minZoom, maxZoom);
});

/// Resizing the viewport will update the projection matrix.
const projectionMatrix = Mat4.perspective(
  fov,
  gl.canvas.width / gl.canvas.height,
  nearPlane,
  farPlane
);
onResize(() => {
  projectionMatrix.perspective(
    fov,
    gl.canvas.width / gl.canvas.height,
    nearPlane,
    farPlane
  );
});

// These variables are used by the draw calls.
// They are updated in the render loop.
const viewPos = Vec3.zero();
const viewMatrix = Mat4.identity();

const lightPos = Vec3.zero();

// =====================================================================
// Geometry
// =====================================================================

const vertexShaderSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform vec3 u_viewPos;
    uniform vec3 u_lightPos;

    in vec3 a_pos;
    in vec3 a_normal;
    in vec3 a_tangent;
    in vec2 a_texCoord;

    out vec3 f_worldPosTangent;
    out vec2 f_texCoord;
    out vec3 f_lightPos;
    out vec3 f_viewPos;
    out vec3 f_normal;
    out vec3 f_worldPos;

    void main() {
        vec3 normal = (u_modelMatrix * vec4(a_normal, 0.0)).xyz;
        vec3 tangent = (u_modelMatrix * vec4(a_tangent, 0.0)).xyz;
        vec3 bitangent = cross(normal, tangent);
        mat3 worldToTangent = transpose(mat3(tangent, bitangent, normal));

        vec4 worldPosition = u_modelMatrix * vec4(a_pos, 1.0);

        // Transform world space coords to tangent space
        f_worldPosTangent = worldToTangent * worldPosition.xyz;
        f_lightPos = worldToTangent * u_lightPos;
        f_viewPos = worldToTangent * u_viewPos;

        f_normal = (u_modelMatrix * vec4(a_normal, 0.0)).xyz;
        f_texCoord = a_texCoord;

        vec4 worldPos = u_modelMatrix * vec4(a_pos, 1.0);
        f_worldPos = worldPos.xyz;

        gl_Position = u_projectionMatrix * u_viewMatrix * worldPosition;
    }
`;
const fragmentShaderSource = `#version 300 es
    precision mediump float;

    uniform float u_ambient;
    uniform float u_diffuse;
    uniform float u_specular;
    uniform float u_shininess;
    uniform vec3 u_lightColor;
    uniform sampler2D u_texDiffuse;
    uniform sampler2D u_texSpecular;
    uniform sampler2D u_texNormal;

    uniform float u_threshold1;
    uniform float u_threshold2;

    in vec3 f_worldPosTangent;
    in vec2 f_texCoord;
    in vec3 f_lightPos;
    in vec3 f_viewPos;
    in vec3 f_normal;
    in vec3 f_worldPos;

    out vec4 o_fragColor;

    void main() {
        // texture
        vec3 texDiffuse = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 texSpecular = texture(u_texSpecular, f_texCoord).rgb;
        vec3 texNormal = texture(u_texNormal, f_texCoord).rgb;

        // lighting
        vec3 normal = normalize(texNormal * (255./128.) - 1.0);
        vec3 lightDir = normalize(f_lightPos - f_worldPosTangent);
        vec3 viewDir = normalize(f_viewPos - f_worldPosTangent);
        vec3 halfWay = normalize(viewDir + lightDir);

        // ambient
        vec3 ambient = texDiffuse * u_ambient;

        // diffuse
        float diffuseIntensity = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = texDiffuse * diffuseIntensity * u_lightColor * u_diffuse;

        // specular
        float specularIntensity = pow(max(dot(normal, halfWay), 0.0), u_shininess);
        vec3 specular = texSpecular * specularIntensity * u_lightColor * u_specular;

        // colors for different parts of the maze
        vec3 pathColor = vec3(.4, .4, .4);
        vec3 wallColor = vec3(.6, .6, .6);

        vec3 faceType = f_worldPos * f_normal;
        vec3 finalColor = vec3(ambient + diffuse + specular);

        if (faceType.x + faceType.y + faceType.z == u_threshold1) {
            finalColor = pathColor * finalColor;
        } else if (faceType.x + faceType.y + faceType.z < u_threshold2) {
            finalColor = wallColor * finalColor;
        }

        // result
        o_fragColor = vec4(finalColor, 1.0);
    }
`;

// =====================================================================
// Maze
// =====================================================================
const mazeShader = glance.createShader(
  gl,
  "maze-shader",
  vertexShaderSource,
  fragmentShaderSource,
  {
    u_modelMatrix: Mat4.identity(),
    u_ambient: 0.1,
    u_diffuse: 0.9,
    u_specular: 0.15,
    u_shininess: 128,
    u_lightColor: [1, 1, 1],
    u_texDiffuse: 0,
    u_texSpecular: 1,
    u_texNormal: 2,
  }
);

// Create the maze cube
const numberOfSegments = 17; // should be uneven and > 5 -> otherwise conditions for labyrinth generation are not met
const cubeSize = 1;
const mazeCube = amazed.generateLabyrinthCube(numberOfSegments, cubeSize);

// tiling size
mazeCube.texCoords = mazeCube.texCoords.map((c, i) =>
  i % 2 === 0 ? c * 8 : c * 4
);

const mazeIBO = glance.createIndexBuffer(gl, mazeCube.indices);
const mazeABO = glance.createAttributeBuffer(gl, "geo-abo", {
  a_pos: { data: mazeCube.positions, height: 3 },
  a_normal: { data: mazeCube.normals, height: 3 },
  a_texCoord: { data: mazeCube.texCoords, height: 2 },
  a_tangent: { data: mazeCube.tangents, height: 3 },
});
const mazeVAO = glance.createVAO(
  gl,
  "geo-vao",
  mazeIBO,
  glance.buildAttributeMap(mazeShader, [mazeABO])
);

const geoTextureDiffuse = await glance.loadTextureNow(
  gl,
  "https://echtzeit-computergrafik-ss24.github.io/img/rockwall-diffuse.avif",
  {
    wrap: gl.REPEAT,
  }
);
const geoTextureSpecular = await glance.loadTextureNow(
  gl,
  "https://echtzeit-computergrafik-ss24.github.io/img/rockwall-specular.avif",
  {
    wrap: gl.REPEAT,
  }
);
const geoTextureNormal = await glance.loadTextureNow(
  gl,
  "https://echtzeit-computergrafik-ss24.github.io/img/rockwall-normal.avif",
  {
    wrap: gl.REPEAT,
  }
);

const mazeDrawCall = glance.createDrawCall(gl, mazeShader, mazeVAO, {
  uniforms: {
    u_viewMatrix: () => viewMatrix,
    u_projectionMatrix: () => projectionMatrix,
    u_viewPos: () => viewPos,
    u_lightPos: () => lightPos,
    u_threshold1: () => cubeSize / 2 - cubeSize / numberOfSegments,
    u_threshold2: () => cubeSize / 2,
  },
  textures: [
    [0, geoTextureDiffuse],
    [1, geoTextureSpecular],
    [2, geoTextureNormal],
  ],
  cullFace: gl.BACK,
  depthTest: gl.LESS,
});

// =====================================================================
// Light Bulb
// =====================================================================

const bulbVSSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;

    in vec3 a_pos;

    void main() {
        gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_pos, 1.0);
    }
`;
const bulbFSSource = `#version 300 es
    precision mediump float;

    out vec4 o_fragColor;

    void main() {
        o_fragColor = vec4(1.0);
    }
`;
const bulbShader = glance.createShader(
  gl,
  "bulb-shader",
  bulbVSSource,
  bulbFSSource
);

const bulbGeo = glance.createSphere("bulb-geo", { radius: 0.1, longitudeBands:  32, latitudeBands: 16,});
const bulbIBO = glance.createIndexBuffer(gl, bulbGeo.indices);
const bulbABO = glance.createAttributeBuffer(gl, "bulb-abo", {
  a_pos: { data: bulbGeo.positions, height: 3 },
});
const bulbVAO = glance.createVAO(
  gl,
  "bulb-vao",
  bulbIBO,
  glance.buildAttributeMap(bulbShader, [bulbABO])
);

const bulbDrawCall = glance.createDrawCall(gl, bulbShader, bulbVAO, {
  uniforms: {
    u_modelMatrix: () => Mat4.fromTranslation(lightPos),
    u_viewMatrix: () => viewMatrix,
    u_projectionMatrix: () => projectionMatrix,
  },
  cullFace: gl.BACK,
  depthTest: gl.LESS,
});

// =====================================================================
// Render Loop
// =====================================================================

setRenderLoop((time) => {
  // Update the user camera
  viewPos.set(0, 0, zoom).rotateX(tilt).rotateY(pan);
  viewMatrix.lookAt(viewPos, Vec3.zero(), Vec3.yAxis());

  // Update the light position
  lightPos.set(
    Math.cos(time * lightSpeed) * lightRadius,
    lightDistance,
    Math.sin(time * lightSpeed) * lightRadius
  );

  // Render the scene
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  glance.performDrawCall(gl, bulbDrawCall, time);
  glance.performDrawCall(gl, mazeDrawCall, time);
});

// Game Code End ///////////////////////////////////////////////////////////
