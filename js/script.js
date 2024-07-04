// #region Setup =======================================================
import * as glance from "../glance/index.js";
import { MazeCube, Player } from "./gameObjects.js";
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

function onKeyDown(callback)
{
  glCanvas.addEventListener('keydown', callback);
}

function onKeyUp(callback)
{
    glCanvas.addEventListener('keyup', callback);
}

// #endregion Setup ====================================================

// #region Constants ===================================================
// Globals
const origin = Vec3.zero();
const up = Vec3.yAxis();

// Camera settings
const fov = Math.PI / 4;
const nearPlane = 0.1;
const farPlane = 14;

const cameraStartAngle = [0., 0.];
const cameraStartDistance = 3.5;
const cameraMinDistance = 0.6;
const cameraMaxDistance = 10.0;

// Light settings
const lightProjection = Mat4.ortho(-1, 1, -1, 1, 0.01, 3);
const lightDirection = new Vec3(0, 0, 0).normalize();
const lightDistance = 1.4;

// #endregion Constants ================================================

// #region Game State ==================================================
// Camera
let viewDist = cameraStartDistance;
let viewPan = cameraStartAngle[0];
let viewTilt = cameraStartAngle[1];
let viewRoll = 0.;
let panDelta = 0;
let tiltDelta = 0;
let rollDelta = 0;

let viewRotationMatrix;
let viewMatrix;
const viewPos = Vec3.zero();

// Light
const lightPos = Vec3.zero();
const lightXform = Mat4.identity();

onMouseDrag((e) => {
  viewPan += e.movementX * -0.01;
  viewTilt += e.movementY * -0.01;
});

onMouseWheel((e) => {
  viewDist = Math.max(
    cameraMinDistance,
    Math.min(cameraMaxDistance, viewDist * (1 + Math.sign(e.deltaY) * 0.2))
  );
});

onKeyDown((e) =>
  {
      if (e.key == "a") {
          panDelta = Math.max(panDelta - 1, -1);
      }
      if (e.key == "d") {
          panDelta = Math.min(panDelta + 1, 1);
      }
      if (e.key == "w") {
          tiltDelta = Math.max(tiltDelta - 1, -1);
      }
      if (e.key == "s") {
          tiltDelta = Math.min(tiltDelta + 1, 1);
      }
      if (e.key == "q") {
          rollDelta = Math.min(rollDelta + 1, 1);
      }
      if (e.key == "e") {
          rollDelta = Math.max(rollDelta - 1, -1);
      }
      if (e.key == "r") {
          viewDist = cameraStartDistance;
          viewPan = cameraStartAngle[0];
          viewTilt = cameraStartAngle[1];
          viewRoll = 0.;
      }
  });
  
  onKeyUp((e) =>
  {
      if (e.key == "a") {
          panDelta = Math.min(panDelta + 1, 1);
      }
      if (e.key == "d") {
          panDelta = Math.max(panDelta - 1, -1);
      }
      if (e.key == "w") {
          tiltDelta = Math.min(tiltDelta + 1, 1);
      }
      if (e.key == "s") {
          tiltDelta = Math.max(tiltDelta - 1, -1);
      }
      if (e.key == "q") {
          rollDelta = Math.max(rollDelta - 1, -1);
      }
      if (e.key == "e") {
          rollDelta = Math.min(rollDelta + 1, 1);
      }
  });

/// Resizing the viewport will update the projection matrix
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

// #endregion Game State ===============================================

// #region Shader Code =================================================
// #region Maze Shader -------------------------------------------------
const mazeVSSource = `#version 300 es
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
const mazeFSSource = `#version 300 es
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
        vec3 wallColor = vec3(.7, .7, .7);

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
        return projCoords.z - bias > closestDepth  ? 0.0 : 1.0;
    }
`;

// #endregion Maze Shader ----------------------------------------------

// #region Player Shader -----------------------------------------------
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
    uniform float u_time;

    in vec3 f_worldPos;
    in vec3 f_normal;
    in vec2 f_texCoord;

    out vec4 o_fragColor;

    float numberOfPixels = 8.; // Results in 16 pixels
    float glowStrength = 2.;
    vec3 color = vec3(1.0, 1.0, 1.5);

    void main() {
      float x = f_texCoord.x * 2. - 1.;
      float y = f_texCoord.y * 2. - 1.;
      vec2 coord = vec2(x - floor(x * numberOfPixels), y - floor(y * numberOfPixels));

      // Compute the distance from the fragment to the cube's center
      float distance = length(coord - 0.5) / numberOfPixels;
      float smoothDistance = smoothstep(.55, 1.4, distance) + .1;

      // Rings
      float ring = sin(distance * 5.0 - u_time / 3.) / 5.0;
      ring = abs(ring);
      ring = smoothstep(0.0, 0.2, ring) + .2;

      distance = smoothDistance * ring;
      float glow = exp(-distance * glowStrength);
      vec3 result = glow * color;
      o_fragColor = vec4(result, 1.0);
    }
`;

// #endregion Player Shader --------------------------------------------

// #region Skybox Shader -----------------------------------------------
const skyboxVSSource = `#version 300 es
    precision highp float;

    uniform mat4 u_viewMatrix;
    uniform mat4 u_projectionMatrix;

    in vec3 a_pos;

    out vec3 f_texCoord;

    void main() {
        f_texCoord = vec3(1, -1, -1) * a_pos;
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
        o_fragColor = texture(u_skybox, f_texCoord);
    }
`;

// #endregion Skybox Shader --------------------------------------------

// #region Shadow Shader -----------------------------------------------
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

// #endregion Shadow Shader --------------------------------------------

// #endregion Shader Code ===============================================

// #region Geometry ====================================================
// #region Maze Cube ---------------------------------------------------
const mazeShader = glance.createShader(
  gl,
  "maze-shader",
  mazeVSSource,
  mazeFSSource,
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
const numberOfSegments = 21; // should be uneven and > 5 -> otherwise conditions for labyrinth generation are not met
const cubeSize = 1;
const mazeCube = MazeCube.create(
  glance.Mat4.identity(),
  cubeSize,
  numberOfSegments
);

// tiling size
mazeCube.geo.texCoords = mazeCube.geo.texCoords.map((c, i) =>
  i % 2 === 0 ? c * numberOfSegments : c * numberOfSegments
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

// Load textures
const geoTextureDiffuse = await glance.loadTextureNow(
  gl,
  "./assets/cobblestone_diffuse.jpg",
  {
    useAnisotropy: false,
    filter: [gl.NEAREST, gl.NEAREST],
    wrap: gl.REPEAT,
  }
);

const geoTextureSpecular = await glance.loadTextureNow(
  gl,
  "./assets/cobblestone_specular.jpg",
  {
    useAnisotropy: false,
    filter: [gl.NEAREST, gl.NEAREST],
    wrap: gl.REPEAT,
  }
);

const geoTextureNormal = await glance.loadTextureNow(
  gl,
  "./assets/cobblestone_normal.jpg",
  {
    useAnisotropy: false,
    filter: [gl.NEAREST, gl.NEAREST],
    wrap: gl.REPEAT,
  }
);

// #endregion Maze Cube -----------------------------------------------

// #region Player Cube -------------------------------------------------
const playerShader = glance.createShader(
  gl,
  "player-shader",
  playerVertexShaderSource,
  playerFragmentShaderSource,
  {
    u_viewPosition: viewPos,
    u_lightDirection: lightDirection,
    u_texDiffuse: 0,
  }
);

// Starting segment
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

// #endregion Player Cube ----------------------------------------------

// #region Skybox ------------------------------------------------------
const skyboxShader = glance.createShader(
  gl,
  "shader-skybox",
  skyboxVSSource,
  skyboxFSSource,
  {
    u_skybox: 0,
  }
);

const skyboxGeo = glance.createBox("skybox-geo");
const skyboxIBO = glance.createIndexBuffer(gl, skyboxGeo.indices);
const skyboxABO = glance.createAttributeBuffer(gl, "skybox-abo", {
  a_pos: { data: skyboxGeo.positions, height: 3 },
});
const skyboxVAO = glance.createVAO(
  gl,
  "skybox-vao",
  skyboxIBO,
  glance.buildAttributeMap(skyboxShader, [skyboxABO])
);

const skyboxTexture = await glance.loadCubemapNow(gl, "skybox-texture", [
  "./assets/skybox/right.png",
  "./assets/skybox/left.png",
  "./assets/skybox/top.png",
  "./assets/skybox/bottom.png",
  "./assets/skybox/front.png",
  "./assets/skybox/back.png",
]);

// #endregion Skybox ----------------------------------------------------

// #endregion Geometry =================================================

// #region Shadow Mapping ==============================================
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

// #endregion Shadow Mapping ===========================================

// #region Draw calls ==================================================
// Maze draw call ------------------------------------------------------
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

// Player draw call ----------------------------------------------------
const playerDrawCall = glance.createDrawCall(gl, playerShader, playerVAO, {
  uniforms: {
    u_modelMatrix: () => playerCube.getModelMatrix(),
    u_viewMatrix: () => viewMatrix,
    u_projectionMatrix: () => projectionMatrix,
    u_viewPosition: () => viewPos,
    u_time: () => performance.now() / 1000,
  },
  cullFace: gl.BACK,
  depthTest: gl.LEQUAL,
});

// Skybox draw call ----------------------------------------------------
const skyboxDrawCall = glance.createDrawCall(gl, skyboxShader, skyboxVAO, {
  uniforms: {
    u_viewMatrix: () => viewMatrix,
    u_projectionMatrix: () => projectionMatrix,
  },
  textures: [[0, skyboxTexture]],
  cullFace: gl.NONE,
  depthTest: gl.LEQUAL,
});

// #endregion Draw calls ===============================================

// #region Time overlay ================================================

// Vertex shader program
const overlayVSSource = `#version 300 es
  precision highp float;

  in vec2 a_pos;
  in vec2 a_texCoord;

  out vec2 f_texCoord;

  void main()
  {
      f_texCoord = a_texCoord;
      gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

// Fragment shader program
const overlayFSSource = `#version 300 es
  precision mediump float;

  uniform sampler2D u_texture;

  in vec2 f_texCoord;

  out vec4 o_fragColor;

  void main() {
      vec3 color = texture(u_texture, f_texCoord).rgb;
      o_fragColor = vec4(color, 1.0);
  }
`;


// create canvas to write in 
const textCanvas = document.createElement('canvas');
textCanvas.width = 256;
textCanvas.height = 256;
const textCtx = textCanvas.getContext('2d');

// Draw text
textCtx.fillStyle = 'rgba(255, 255, 255, 0)';
textCtx.fillRect(0, 0, textCanvas.width, textCanvas.height);
textCtx.fillStyle = 'blue';
textCtx.font = '48px sans-serif';
textCtx.fillText('hello', 50, 100);


const overlayShader = glance.createShader(gl, "overlay-shader", overlayVSSource, overlayFSSource, {
  u_texture: 0,
});

const overlayGeo = glance.createScreenQuat("overlay-geo", {
  in2D: true,
});

const overlayIBO = glance.createIndexBuffer(gl, overlayGeo.indices);
const overlayABO = glance.createAttributeBuffer(gl, "overlay-abo", {
  a_pos: { data: overlayGeo.positions, height: 2 },
  a_texCoord: { data: overlayGeo.texCoords, height: 2 },
});
const overlayVAO = glance.createVAO(gl, "overlay-vao", overlayIBO, glance.buildAttributeMap(overlayShader, [overlayABO]));

const overlayTexture = glance.createTexture(
  gl,
  "color-target",
  textCanvas.width,
  textCanvas.height,
  gl.TEXTURE_2D,
  null,
  {
    useAnisotropy: false,
    internalFormat: gl.RGBA8,
    levels: 1,  // in case not working, change to 1
    filter: gl.LINEAR,
    wrap: gl.CLAMP_TO_EDGE,
  },
);

// doing this in an update, because I don't think source is set-able in createTexture()
glance.updateTexture(
gl,
overlayTexture,
textCanvas,
{flipY: true}
)

const overlayDrawCall = glance.createDrawCall(gl, overlayShader, overlayVAO, {
uniforms: {},
textures: [
[0, overlayTexture],
],
cullFace: gl.NONE,
depthTest: gl.NONE,
});



// #region Render Loop =================================================
const framebufferStack = new glance.FramebufferStack();

setRenderLoop((time) => {
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Update the user camera
  viewRotationMatrix = (Mat4.fromRotation(new Vec3(0, 1, 0), viewPan).mul(
    Mat4.fromRotation(new Vec3(1, 0, 0), viewTilt)).mul(Mat4.fromRotation(new Vec3(0, 0, 1), viewRoll))
  );
  viewMatrix = viewRotationMatrix.mul(
    Mat4.fromTranslation(new Vec3(0, 0, viewDist))
  );
  viewMatrix.invert();
  
  viewPos.set(0, 0, viewDist).rotateX(viewTilt).rotateY(viewPan).rotateZ(viewRoll);

  if (panDelta != 0 || tiltDelta != 0 || rollDelta != 0) {
    viewPan += panDelta * 0.02;
    viewTilt += tiltDelta * 0.02;
    viewRoll += rollDelta * 0.02;
  }


  // Update the light position
  const playerPos = new Vec3(
    playerCube.getModelMatrix().getTranslation().x,
    playerCube.getModelMatrix().getTranslation().y,
    playerCube.getModelMatrix().getTranslation().z
  );
  lightPos.set(
    playerPos.x * lightDistance,
    playerPos.y * lightDistance,
    playerPos.z * lightDistance
  );
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

  // Render the scene
  glance.performDrawCall(gl, skyboxDrawCall, time);
  glance.performDrawCall(gl, mazeDrawCall, time);
  glance.performDrawCall(gl, playerDrawCall, time);
});

// #endregion Render Loop ===============================================
