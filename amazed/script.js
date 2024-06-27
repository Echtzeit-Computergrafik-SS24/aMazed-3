import * as glance from "../glance/js/index.js";
import { Cube, MazeCube, Player } from "./gameObjects.js";
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

// Globals
const origin = Vec3.zero();
const up = Vec3.yAxis();

const fov = Math.PI / 4;
const nearPlane = 0.1;
const farPlane = 14;

const cameraSpeed = 0.003;
const zoomSpeed = 0.2;
const minZoom = 1.0;
const maxZoom = 10.0;
const minPan = -Infinity;
const maxPan = Infinity;
const minTilt = -Infinity;
const maxTilt = Infinity;

// Light settings
const lightProjection = Mat4.ortho(-1, 1, -1, 1, 0.1, 2);

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
const lightXform = Mat4.identity();

const shadowDepthTexture = glance.createTexture(
  gl,
  "shadow-depth",
  2048,
  2048,
  gl.TEXTURE_2D,
  null,
  {
    useAnisotropy: false,
    internalFormat: gl.DEPTH_COMPONENT16,
    levels: 1,
    filter: gl.NEAREST,
  }
);

// =====================================================================
// Maze
// =====================================================================

const vertexShaderSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;
    uniform vec3 u_viewPosition;
    uniform vec3 u_lightPosition;
    uniform mat4 u_lightProjection;
    uniform mat4 u_lightXform;

    in vec3 a_pos;
    in vec3 a_normal;
    in vec3 a_tangent;
    in vec2 a_texCoord;

    out vec3 f_worldPosTangent;
    out vec2 f_texCoord;
    out vec3 f_lightPos;
    out vec3 f_viewPos;
    out vec3 f_normal;
    out vec3 f_fragPosWS;
    out vec4 f_fragPosLS;

    void main() {
        vec3 normal = (u_modelMatrix * vec4(a_normal, 0.0)).xyz;
        vec3 tangent = (u_modelMatrix * vec4(a_tangent, 0.0)).xyz;
        vec3 bitangent = cross(normal, tangent);
        mat3 worldToTangent = transpose(mat3(tangent, bitangent, normal));

        vec4 worldPosition = u_modelMatrix * vec4(a_pos, 1.0);

        // Transform world space coords to tangent space
        f_worldPosTangent = worldToTangent * worldPosition.xyz;
        f_lightPos = worldToTangent * u_lightPosition;
        f_viewPos = worldToTangent * u_viewPosition;

        f_normal = (u_modelMatrix * vec4(a_normal, 0.0)).xyz;
        f_texCoord = a_texCoord;

        f_fragPosWS = worldPosition.xyz;
        f_fragPosLS = u_lightProjection * u_lightXform * worldPosition;

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
    uniform sampler2D u_texShadow;

    uniform float u_threshold1;
    uniform float u_threshold2;

    in vec3 f_worldPosTangent;
    in vec2 f_texCoord;
    in vec3 f_lightPos;
    in vec3 f_viewPos;
    in vec3 f_normal;
    in vec3 f_fragPosWS;
    in vec4 f_fragPosLS;

    out vec4 o_fragColor;

    float calculateShadow();

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

        // diffuse
        float diffuseIntensity = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = texDiffuse * diffuseIntensity * u_lightColor * u_diffuse;

        // ambient
        vec3 ambient = texDiffuse * u_ambient;

        // specular
        float specularIntensity = pow(max(dot(normal, halfWay), 0.0), u_shininess);
        vec3 specular = texSpecular * specularIntensity * u_lightColor * u_specular;

        // shadow
        float shadow = calculateShadow();

        // colors for different parts of the maze
        vec3 pathColor = vec3(.4, .4, .4);
        vec3 wallColor = vec3(.6, .6, .6);

        vec3 faceType = f_fragPosWS * f_normal;
        vec3 finalColor = vec3(ambient + shadow * (diffuse + specular));

        if (faceType.x + faceType.y + faceType.z == u_threshold1) {
            finalColor = pathColor * finalColor;
        } else if (faceType.x + faceType.y + faceType.z < u_threshold2) {
            finalColor = wallColor * finalColor;
        }

        // result
        o_fragColor = vec4(finalColor, 1.0);
    }

    float calculateShadow() {
        // Perspective divide.
        vec3 projCoords = f_fragPosLS.xyz / f_fragPosLS.w;

        // Transform to [0,1] range.
        projCoords = projCoords * 0.5 + 0.5;

        // No shadow for fragments outside of the light's frustum.
        if(any(lessThan(projCoords, vec3(0))) || any(greaterThan(projCoords, vec3(1)))){
            return 1.0;
        }

        float bias = 0.01;
        float closestDepth = texture(u_texShadow, projCoords.xy).r;
        return projCoords.z - bias > closestDepth ? 0.0 : 1.0;
    }
`;

const mazeShader = glance.createShader(
  gl,
  "maze-shader",
  vertexShaderSource,
  fragmentShaderSource,
  {
    u_lightProjection: lightProjection,
    u_modelMatrix: Mat4.identity(),
    u_ambient: 0.2,
    u_diffuse: 0.9,
    u_specular: 0.15,
    u_shininess: 128,
    u_lightColor: [1.2, 1.3, 1.7],
    u_texDiffuse: 0,
    u_texSpecular: 1,
    u_texNormal: 2,
    u_texShadow: 3,
  }
);

// Create the maze cube
const numberOfSegments = 17; // should be uneven and > 5 -> otherwise conditions for labyrinth generation are not met
const cubeSize = 1;
const mazeCube = MazeCube.create(
  glance.Mat4.identity(),
  cubeSize,
  numberOfSegments
);

// tiling size
mazeCube.geo.texCoords = mazeCube.geo.texCoords.map((c, i) =>
  i % 2 === 0 ? c * 8 : c * 4
);
// Prep mazeCube
const mazeIBO = glance.createIndexBuffer(gl, mazeCube.geo.indices);
const mazeABO = glance.createAttributeBuffer(gl, "maze-abo", {
  a_pos: { data: mazeCube.geo.positions, height: 3 },
  a_normal: { data: mazeCube.geo.normals, height: 3 },
  a_texCoord: { data: mazeCube.geo.texCoords, height: 2 },
  a_tangent: { data: mazeCube.geo.tangents, height: 3 },
});
const mazeVAO = glance.createVAO(
  gl,
  "maze-vao",
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
    u_modelMatrix: () => mazeCube.getModelMatrix(),
    u_viewMatrix: () => viewMatrix,
    u_projectionMatrix: () => projectionMatrix,
    u_viewPosition: () => viewPos,
    u_lightPosition: () => lightPos,
    u_lightXform: () => lightXform,
    u_threshold1: () => mazeCube.size / 2 - mazeCube.size / numberOfSegments,
    u_threshold2: () => mazeCube.size / 2,
  },
  textures: [
    [0, geoTextureDiffuse],
    [1, geoTextureSpecular],
    [2, geoTextureNormal],
    [3, shadowDepthTexture],
  ],
  cullFace: gl.BACK,
  depthTest: gl.LESS,
});

// =====================================================================
// Player
// =====================================================================

// movement bindings
document.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "ArrowUp":
      playerCube.moveForward();
      break;
    case "ArrowDown":
      playerCube.moveBackward();
      break;
    case "ArrowRight":
      playerCube.moveRight();
      break;
    case "ArrowLeft":
      playerCube.moveLeft();
      break;
  }
});

const playerVertexShaderSource = `#version 300 es
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
const playerFragmentShaderSource = `#version 300 es
    precision mediump float;

    uniform vec3 u_viewPosition;
    uniform sampler2D u_texDiffuse;

    in vec3 f_worldPos;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    void main() {
      float glowStrength = 1.0;
      vec3 color = vec3(1.1, 1.0, 1.5);

      // Compute the distance from the fragment to the cube's center
      float distance = length(f_texCoord - 0.5);

      // Determine the glow factor based on distance
      float glow = exp(-distance * glowStrength);

      // Calculate the lighting (ambient + diffuse)
      vec3 result = glow * color;

      // Combine the results
      o_fragColor = vec4(result, 1.0);
    }
`;

const playerShader = glance.createShader(
  gl,
  "player-shader",
  playerVertexShaderSource,
  playerFragmentShaderSource,
  {
    u_viewPosition: viewPos,
    u_texDiffuse: 0,
  }
);
const side = 0;
const nthSegment = 5;
const playerCube = Player.create(mazeCube, side, nthSegment, numberOfSegments);

// Prep playerCube
const playerIBO = glance.createIndexBuffer(gl, playerCube.geo.indices);
const playerABO = glance.createAttributeBuffer(gl, "player-abo", {
  a_pos: { data: playerCube.geo.positions, height: 3 },
  a_normal: { data: playerCube.geo.normals, height: 3 },
  a_texCoord: { data: playerCube.geo.texCoords, height: 2 },
  a_tangent: { data: playerCube.geo.tangents, height: 3 },
});
const playerVAO = glance.createVAO(
  gl,
  "player-vao",
  playerIBO,
  glance.buildAttributeMap(playerShader, [playerABO])
);
const playerTextureDiffuse = await glance.loadTextureNow(
  gl,
  "https://echtzeit-computergrafik-ss24.github.io/img/polybox-diffuse.png"
);
const playerDrawCall = glance.createDrawCall(gl, playerShader, playerVAO, {
  uniforms: {
    u_modelMatrix: () => playerCube.getModelMatrix(),
    u_viewMatrix: () => viewMatrix,
    u_projectionMatrix: () => projectionMatrix,
    u_viewPosition: () => viewPos,
  },
  textures: [[0, playerTextureDiffuse]],
  cullFace: gl.BACK,
  depthTest: gl.LEQUAL,
});

// =====================================================================
// Skybox
// =====================================================================

const skyboxVSSource = `#version 300 es
    precision highp float;

    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;

    in vec3 a_pos;

    out vec3 f_texCoord;

    void main() {
        // Use the local position of the vertex as texture coordinate.
        f_texCoord = vec3(1, -1, -1) * a_pos;

        // By setting Z == W, we ensure that the vertex is projected onto the
        // far plane, which is exactly what we want for the background.
        vec4 ndcPos = u_projectionMatrix * u_viewMatrix * vec4(a_pos, 0.0);
        gl_Position = ndcPos.xyww;
    }
`;

const skyboxFSSource = `#version 300 es
    precision mediump float;

    uniform samplerCube u_skybox;

    in vec3 f_texCoord;

    out vec4 o_fragColor;

    void main() {
        // The fragment color is simply the color of the skybox at the given
        // texture coordinate (local coordinate) of the fragment on the cube.
        o_fragColor = texture(u_skybox, f_texCoord);
    }
`;

const skyboxVertexShader = gl.createShader(gl.VERTEX_SHADER);
gl.shaderSource(skyboxVertexShader, skyboxVSSource);
gl.compileShader(skyboxVertexShader);

const skyboxFragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
gl.shaderSource(skyboxFragmentShader, skyboxFSSource);
gl.compileShader(skyboxFragmentShader);

const skyboxShaderProgram = gl.createProgram();
gl.attachShader(skyboxShaderProgram, skyboxVertexShader);
gl.attachShader(skyboxShaderProgram, skyboxFragmentShader);
gl.linkProgram(skyboxShaderProgram);

// Create the Skybox attributes and -indices.
const skybox = glance.createBox("my-skybox");

// Create a Vertex Array Object (VAO) to store the skybox setup.
const skyboxVAO = gl.createVertexArray();
gl.bindVertexArray(skyboxVAO);

const skyboxAttributeBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, skyboxAttributeBuffer);
gl.bufferData(
  gl.ARRAY_BUFFER,
  new Float32Array(skybox.positions),
  gl.STATIC_DRAW
);

const skyboxIndexBuffer = gl.createBuffer();
const skyboxIndexData = new Uint16Array(skybox.indices);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, skyboxIndexBuffer);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, skyboxIndexData, gl.STATIC_DRAW);

const skyboxPositionAttribute = gl.getAttribLocation(
  skyboxShaderProgram,
  "a_pos"
);
gl.enableVertexAttribArray(skyboxPositionAttribute);
gl.vertexAttribPointer(
  skyboxPositionAttribute,
  3,
  gl.FLOAT,
  false,
  3 * 4,
  0 * 4
);

const skyboxTextureUrls = [
  "./assets/skybox/right.png",
  "./assets/skybox/left.png",
  "./assets/skybox/bottom.png",
  "./assets/skybox/top.png",
  "./assets/skybox/front.png",
  "./assets/skybox/back.png",
];

const skyboxTexture = gl.createTexture();

let cubeMapFacesLoaded = 0;
for (let texUrlIdx = 0; texUrlIdx < 6; texUrlIdx++) {
  // Bind the texture to the right target
  const bindTarget = gl.TEXTURE_CUBE_MAP;
  gl.bindTexture(bindTarget, skyboxTexture);

  // Define the placeholder texture data
  const dataTarget = gl.TEXTURE_CUBE_MAP_POSITIVE_X + texUrlIdx;
  gl.texImage2D(
    dataTarget,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255])
  );

  let image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    cubeMapFacesLoaded++;

    gl.bindTexture(bindTarget, skyboxTexture);

    // Tell WebGL to flip texture data vertically when loading it.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(dataTarget, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    if (cubeMapFacesLoaded === 6) {
      gl.generateMipmap(bindTarget);
      gl.texParameteri(
        bindTarget,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR
      );
    }
    image = null;
  };
  image.src = skyboxTextureUrls[texUrlIdx];
}

// Handle skybox uniforms.
const skyboxViewMatrixUniform = gl.getUniformLocation(
  skyboxShaderProgram,
  "u_viewMatrix"
);
const skyboxProjectionMatrixUniform = gl.getUniformLocation(
  skyboxShaderProgram,
  "u_projectionMatrix"
);
const skyboxTextureUniform = gl.getUniformLocation(
  skyboxShaderProgram,
  "u_skybox"
);

gl.useProgram(skyboxShaderProgram);
gl.uniformMatrix4fv(skyboxProjectionMatrixUniform, false, projectionMatrix);
gl.uniform1i(skyboxTextureUniform, 0);

// =====================================================================
// Shadow Mapping
// =====================================================================

const shadowVSSource = `#version 300 es
    precision highp float;

    uniform mat4 u_modelMatrix;
    uniform mat4 u_lightXform;
    uniform mat4 u_lightProjection;

    in vec3 a_pos;

    void main()
    {
        gl_Position = u_lightProjection * u_lightXform * u_modelMatrix * vec4(a_pos, 1.0);
    }
`;

const shadowFSSource = `#version 300 es
    precision mediump float;

    void main() {}
`;

const shadowShader = glance.createShader(
  gl,
  "shadow-shader",
  shadowVSSource,
  shadowFSSource,
  {
    u_lightProjection: lightProjection,
  }
);

const shadowFramebuffer = glance.createFramebuffer(
  gl,
  "shadow-framebuffer",
  null,
  shadowDepthTexture
);

const shadowDrawCalls = [
  glance.createDrawCall(gl, shadowShader, mazeVAO, {
    uniforms: {
      u_modelMatrix: () => Mat4.identity(),
      u_lightXform: () => lightXform,
    },
    cullFace: gl.BACK,
    depthTest: gl.LESS,
  }),
];

// =====================================================================
// Render Loop
// =====================================================================

const framebufferStack = new glance.FramebufferStack();

setRenderLoop((time) => {
  // Do not draw anything until all textures are loaded.
  if (cubeMapFacesLoaded < 6) {
    return;
  }

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Update the user camera
  viewPos.set(0, 0, zoom).rotateX(tilt).rotateY(pan);
  viewMatrix.lookAt(viewPos, Vec3.zero(), Vec3.yAxis());



  // Update the light position
  lightPos
    .set(playerCube.getModelMatrix().getTranslation().x, playerCube.getModelMatrix().getTranslation().y, playerCube.getModelMatrix().getTranslation().z);
  lightXform.lookAt(lightPos, origin, up);

  // Render shadow map
  framebufferStack.push(gl, shadowFramebuffer);
  {
    gl.clear(gl.DEPTH_BUFFER_BIT);
    for (const drawCall of shadowDrawCalls) {
      glance.performDrawCall(gl, drawCall, time);
    }
  }
  framebufferStack.pop(gl);

  {
    // Draw the skybox
    gl.useProgram(skyboxShaderProgram);

    // Textures.
    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, skyboxTexture);

    // Uniforms.
    gl.uniformMatrix4fv(skyboxViewMatrixUniform, false, viewMatrix);

    // Draw Call Parameters
    gl.disable(gl.CULL_FACE);

    // VAO
    gl.bindVertexArray(skyboxVAO);

    // Draw Call
    gl.drawElements(gl.TRIANGLES, skyboxIndexData.length, gl.UNSIGNED_SHORT, 0);
  }

  // Render the scene
  glance.performDrawCall(gl, mazeDrawCall, time);
  glance.performDrawCall(gl, playerDrawCall, time);
});