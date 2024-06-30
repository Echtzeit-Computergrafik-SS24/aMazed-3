//#region boilerplate
// Get the WebGL context
const glCanvas = document.getElementById("canvas");
const gl = glance.getContext(glCanvas);

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

function onMouseDrag(callback) {
  glCanvas.addEventListener("pointerdown", () => {
    const stopDrag = () => {
      glCanvas.removeEventListener("pointermove", callback);
      glCanvas.removeEventListener("pointerup", stopDrag);
      glCanvas.removeEventListener("pointerleave", stopDrag);
    };

    glCanvas.addEventListener("pointermove", callback);
    glCanvas.addEventListener("pointerup", stopDrag, { once: true });
    glCanvas.addEventListener("pointerleave", stopDrag, { once: true });
  });
}

function onMouseWheel(callback) {
  glCanvas.addEventListener("wheel", callback);
}

// Basic render loop manager.
function setRenderLoop(callback) {
  function renderLoop(time) {
    if (setRenderLoop._callback !== null) {
      setRenderLoop._callback(time);
      requestAnimationFrame(renderLoop);
    }
  }
  setRenderLoop._callback = callback;
  requestAnimationFrame(renderLoop);
}
setRenderLoop._callback = null;

import * as glance from "../glance/js/index.js";
import { MazeCube, Player } from "./gameObjects.js";

//#endregion
// BOILERPLATE END
////////////////////////////////////////////////////////////////////////////////

const { Vec3, Mat4, Mat3 } = glance;

// =============================================================================
// Constants
// =============================================================================

const lightFarPlane = 20;

const cameraProjection = Mat4.perspective(Math.PI / 4, 1, 0.1, 28).toArray();
const lightProjection = Mat4.perspective(
  Math.PI / 2,
  1,
  0,
  lightFarPlane
).toArray();

const cameraStartAngle = [-0.3, -0.6];
const cameraStartDistance = 3.5;
const cameraMinDistance = 1.5;
const cameraMaxDistance = 10.0;

const lightRadius = 5.0;
const lightSpeed = 0.0005;

// =============================================================================
// Shader Code
// =============================================================================

//#region  Solids ----------------------------------------------------------------------

const mazeVSSource = `#version 300 es
    precision highp float;

    uniform mat4 u_viewXform;
    uniform mat4 u_viewProjection;
    uniform vec3 u_lightPos;
    uniform vec3 u_viewPos;

    layout (location = 0) in vec3 a_pos;
    layout (location = 1) in mat4 a_modelMatrix;
    layout (location = 5) in vec3 a_normal;
    layout (location = 6) in vec3 a_tangent;
    layout (location = 7) in mat3 a_normalMatrix;
    layout (location = 10) in vec2 a_texCoord;

    out vec3 f_fragPosWS;
    out vec3 f_fragPosTS;
    out vec3 f_lightPosWS;
    out vec3 f_lightPosTS;
    out vec3 f_viewPosTS;
    out vec2 f_texCoord;

    void main() {
        vec4 worldPos = a_modelMatrix * vec4(a_pos, 1.0);
        f_fragPosWS = worldPos.xyz;
        f_lightPosWS = u_lightPos;

        // Transform world space coords to tangent space
        vec3 normal = a_normalMatrix * a_normal;
        vec3 tangent = a_normalMatrix * a_tangent;
        vec3 bitangent = cross(normal, tangent);
        mat3 tbn = transpose(mat3(tangent, bitangent, normal));
        f_fragPosTS = tbn * f_fragPosWS;
        f_lightPosTS = tbn * u_lightPos;
        f_viewPosTS = tbn * u_viewPos;

        f_texCoord = a_texCoord;
        gl_Position = u_viewProjection * u_viewXform * worldPos;
    }
`;

const mazeFSSource = `#version 300 es
    precision mediump float;

    uniform float u_ambient;
    uniform float u_specular;
    uniform float u_shininess;
    uniform vec3 u_lightColor;
    uniform sampler2D u_texDiffuse;
    uniform sampler2D u_texSpecular;
    uniform sampler2D u_texNormal;
    uniform mediump samplerCube u_texShadow;

    in vec3 f_fragPosWS;
    in vec3 f_fragPosTS;
    in vec3 f_lightPosWS;
    in vec3 f_lightPosTS;
    in vec3 f_viewPosTS;
    in vec2 f_texCoord;

    out vec4 FragColor;

    float calculateShadow(float);

    const float farPlane = ${lightFarPlane.toFixed(2)};

    void main() {

        // texture
        vec3 texDiffuse = texture(u_texDiffuse, f_texCoord).rgb;
        vec3 texSpecular = texture(u_texSpecular, f_texCoord).rgb;
        vec3 texNormal = texture(u_texNormal, f_texCoord).rgb;

        // ambient
        vec3 ambient = texDiffuse * u_ambient;

        // diffuse
        vec3 normal = normalize(texNormal * (255./128.) - 1.0);
        vec3 lightDir = normalize(f_lightPosTS - f_fragPosTS);
        float diffuseIntensity = max(dot(normal, lightDir), 0.0);
        vec3 diffuse = diffuseIntensity * u_lightColor * texDiffuse;

        // specular
        vec3 viewDir = normalize(f_viewPosTS - f_fragPosTS);
        vec3 halfWay = normalize(lightDir + viewDir);
        float specularIntensity = pow(max(dot(normal, halfWay), 0.0), u_shininess);
        vec3 specular = (u_specular * specularIntensity) * texSpecular * u_lightColor;

        // shadow
        float shadow = calculateShadow(diffuseIntensity);

        // color
        FragColor = vec4(ambient + shadow * (diffuse + specular), 1.0);
    }

    float calculateShadow(float diffuseIntensity) {
        // Get the vector from the fragment to the light source.
        vec3 fragToLight = f_fragPosWS - f_lightPosWS;

        // Get the depth to the closest surface from the light's perspective.
        float closestDepth = texture(u_texShadow, fragToLight).r;

        // Get the current depth from the light's perspective.
        float fragDepth = length(fragToLight) / (farPlane );

        // A fixed bias stops a shadow caster from self-shadowing.
        float bias = 0.05;

        return (fragDepth - bias) > closestDepth ? 0.0 : 1.0;
    }
`;

//#endregion

//#region Shadow ----------------------------------------------------------------------

const shadowVertexShader = `#version 300 es
precision highp float;

layout (location = 0) in vec3 a_pos;
layout (location = 1) in mat4 a_modelMatrix;

uniform mat4 u_lightXform;
uniform mat4 u_lightProjection;

out vec3 FragPos;

void main()
{
    FragPos = (a_modelMatrix * vec4(a_pos, 1.0)).xyz;
    gl_Position = u_lightProjection * u_lightXform * a_modelMatrix * vec4(a_pos, 1.0);
}
`;

const shadowFragmentShader = `#version 300 es
    precision mediump float;

    uniform highp mat4 u_lightXform;

    in vec3 FragPos;

    const float farPlane = ${lightFarPlane.toFixed(2)};

    void main() {
        // get distance between fragment and light source
        float lightDistance = length(FragPos - vec3(vec4(0.0, 0.0, -1.0, 1.0) * u_lightXform));

        // map to [0;1] range by dividing by far_plane
        lightDistance = lightDistance / farPlane;

        // write this as modified depth
        gl_FragDepth = lightDistance;
    }
`;
//#endregion

// =============================================================================
// Geometry
// =============================================================================

//#region Maze ----------------------------------------------------------------------

const mazeShader = glance.createShader(
  gl,
  "solid-shader",
  mazeVSSource,
  mazeFSSource,
  {
    u_ambient: 0.1,
    u_specular: 0.15,
    u_shininess: 128,
    u_lightColor: [1, 1, 1],
    u_viewProjection: cameraProjection,
    u_texDiffuse: 0,
    u_texSpecular: 1,
    u_texNormal: 2,
    u_texShadow: 3,
  }
);

// Create the maze cube
const numberOfSegments = 17; // should be uneven and > 5 -> otherwise conditions for labyrinth generation are not met
const cubeSize = 1;
const mazeCube = MazeCube.create(Mat4.identity(), cubeSize, numberOfSegments);

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

const mazeIABO = glance.createAttributeBuffer(gl, "maze-iabo", {
    a_modelMatrix: { data: mazeCube.getModelMatrix().toArray(), height: 4, width: 4 },
    a_normalMatrix: { data: Mat3.identity().toArray(), height: 3, width: 3 },
    });

const mazeVAO = glance.createVAO(
  gl,
  "maze-vao",
  mazeIBO,
  glance.buildAttributeMap(mazeShader, [mazeABO, mazeIABO])
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

//#endregion

// =============================================================================
// Shadow Setup
// =============================================================================

// The Shadow shader is the same as for directional lights.
const shadowShader = glance.createShader(
  gl,
  "shadow-shader",
  shadowVertexShader,
  shadowFragmentShader,
  {
    u_lightProjection: lightProjection,
  }
);

// Create a cube map texture to store the depth values of the shadow map.
const shadowDepthTexture = glance.createTexture(
  gl,
  "shadow-depth",
  512,
  512,
  gl.TEXTURE_CUBE_MAP,
  null,
  {
    useAnisotropy: false,
    internalFormat: gl.DEPTH_COMPONENT16,
    levels: 1,
    filter: gl.NEAREST,
  }
);

// Create a framebuffer for each face of the cube map (6 total).
const shadowFramebuffers = Array.from({ length: 6 }, (_, i) =>
  glance.createFramebuffer(gl, `shadow-framebuffer${i}`, null, {
    attachment: shadowDepthTexture,
    target: gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
  })
);

// =============================================================================
// Draw Calls
// =============================================================================

// Scene State
let viewDist = cameraStartDistance;
let viewPan = cameraStartAngle[0];
let viewTilt = cameraStartAngle[1];
let panDelta = 0;
let tiltDelta = 0;

let viewRotationMatrix;
let viewMatrix;
let invViewMatrix;

let lightPos;
let lightDirections;
let lightXform;

const mazeDrawCall = glance.createDrawCall(gl, mazeShader, mazeVAO, {
  uniforms: {
    u_lightPos: () => lightPos,
    u_viewXform: () => invViewMatrix,
    u_viewPos: () => Vec3.zero().applyMat4(viewMatrix),
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

// Shadow ----------------------------------------------------------------------
const shadowDrawCalls = glance.createDrawCall(gl, shadowShader, mazeVAO, {
  uniforms: {
    u_lightXform: () => lightXform.toArray(),
  },
  cullFace: gl.BACK,
  depthTest: gl.LESS,
});
// =============================================================================
// System Integration
// =============================================================================
const framebufferStack = new glance.FramebufferStack();

//#region

setRenderLoop((time) => {
  // update matrices
  viewRotationMatrix = Mat4.fromRotation(new Vec3(0, 1, 0), viewPan).mul(
    Mat4.fromRotation(new Vec3(1, 0, 0), viewTilt)
  );
  viewMatrix = viewRotationMatrix.mul(
    Mat4.fromTranslation(new Vec3(0, 0, viewDist))
  );
  invViewMatrix = viewMatrix.invert();

  lightPos = new Vec3(0, 0, -lightRadius).applyMat4(
    Mat4.fromRotation(new Vec3(0, 0, -1), time * lightSpeed).mul(
      Mat4.fromRotation(new Vec3(1, 0, 0), time * lightSpeed * 0.5)
    )
  );

  lightDirections = [
    Mat4.lookAt(
      lightPos,
      lightPos.clone().add(new Vec3(+1, 0, 0)),
      new Vec3(0, -1, 0)
    ),
    Mat4.lookAt(
      lightPos,
      lightPos.clone().add(new Vec3(-1, 0, 0)),
      new Vec3(0, -1, 0)
    ),
    Mat4.lookAt(
      lightPos,
      lightPos.clone().add(new Vec3(0, +1, 0)),
      new Vec3(0, 0, 1)
    ),
    Mat4.lookAt(
      lightPos,
      lightPos.clone().add(new Vec3(0, -1, 0)),
      new Vec3(0, 0, -1)
    ),
    Mat4.lookAt(
      lightPos,
      lightPos.clone().add(new Vec3(0, 0, +1)),
      new Vec3(0, -1, 0)
    ),
    Mat4.lookAt(
      lightPos,
      lightPos.clone().add(new Vec3(0, 0, -1)),
      new Vec3(0, -1, 0)
    ),
  ];

  if (panDelta != 0 || tiltDelta != 0) {
    viewPan += panDelta * 0.02;
    viewTilt += tiltDelta * 0.02;
  }

  for (let i = 0; i < 6; ++i) {
    framebufferStack.push(gl, shadowFramebuffers[i]);
    {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      lightXform = lightDirections[i];

      glance.performDrawCall(gl, shadowDrawCalls, time);
    }
    framebufferStack.pop(gl);
  }
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  glance.performDrawCall(gl, mazeDrawCall, time);
});

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

//#endregion
