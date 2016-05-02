#!/usr/bin/env node

'use strict';

const Promise = require('bluebird');
const path = require('path');
const util = require('util');
const fs = Promise.promisifyAll(require('fs'));
const cesium = require('./cesium');

const embedArr = [ 'textures', 'shaders' ];
const embed = {};

const argv = require('yargs')
  .usage('Usage: $0 <file> [options]')
  .demand(1)
  .array('e')
  .describe('e', 'embeds textures or shaders into binary GLTF file')
  .choices('e', embedArr)
  .alias('e', 'embed')
  .boolean('cesium')
  .describe('cesium', 'sets the old body buffer name for compatibility with Cesium')
  .boolean('b3dm')
  .describe('b3dm', 'outputs b3dm files instead of gltf')
  .boolean('rtc')
  .describe('rtc', '[lon] [lat] add relative to center position extension')
  .string('lon')
  .describe('lon', 'longitude for rtc')
  .string('lat')
  .describe('lat', 'latitude for rtc')
  .string('fs')
  .describe('fs', 'name of external fragment shader')
  .string('vs')
  .describe('vs', 'name of external vertex shader')
  .string('bounds')
  .describe('bounds', 'filename for .json thath contains bounds')
  .help('h')
  .alias('h', 'help')
  .argv;

var lon, lat;
if (argv.rtc) {
  if (!argv.lon || !argv.lat) {
    console.error('Pleasep provide [lon] [lat] parameter after --rtc');
    return;
  }
  lon = parseFloat(argv.lon);
  if (!lon) {
    console.error('Pleasep provide valid [lon] value');
    return;
  }
  lat = parseFloat(argv.lat);
  if (!lat) {
    console.error('Pleasep provide valid [lat] value');
    return;
  }  
}

if (argv.embed) {
  // If just specified as --embed, embed all types into body.
  const arr = argv.embed.length ? argv.embed : embedArr;

  // Enable the specific type of resource to be embedded.
  arr.forEach(function (type) {
    embed[type] = true;
  });
}

const filename = argv._[0];
const BUFFER_NAME = argv.cesium ? 'KHR_binary_glTF' : 'binary_glTF';

if (!filename.endsWith('.gltf')) {
  console.error('Failed to create binary GLTF file:');
  console.error('----------------------------------');
  console.error('File specified does not have the .gltf extension.');
  return;
}

// Lets us keep track of how large the body will be, as well as the offset for each of the
// original buffers.
let bodyLength = 0;
const bodyParts = [];

const base64Regexp = /^data:.*?;base64,/;
const containingFolder = path.dirname(filename);
var rotMat;
var worldPos;

function addToBody(uri) {  
  let promise;
  if (uri.startsWith('data:')) {
    if (!base64Regexp.test(uri)) throw new Error('unsupported data URI');
    promise = Promise.resolve(new Buffer(uri.replace(base64Regexp, ''), 'base64'));
  }
  else promise = fs.readFileAsync(path.join(containingFolder, uri));

  return promise.then(function (contents) {
    const offset = bodyLength;
    bodyParts.push(offset, contents);  
    const length = contents.length;
    bodyLength += length;
    return { offset, length };
  });
}

fs.readFileAsync(filename, 'utf-8').then(function (gltf) {
  // Modify the GLTF data to reference the buffer in the body instead of external references.
  const scene = JSON.parse(gltf);  

  // Let a GLTF parser know that it is using the Binary GLTF extension.
  if (Array.isArray(scene.extensionsUsed)) scene.extensionsUsed.push('KHR_binary_glTF');
  else scene.extensionsUsed = [ 'KHR_binary_glTF' ];

  if (argv.rtc) {
    scene.extensionsUsed.push('CESIUM_RTC');

    var wpos = cesium.fromDegrees(lon, lat, 0.0);
    worldPos = wpos;

    var pos = {
      center: [
        wpos.x,
        wpos.y,
        wpos.z
      ]
    }; 
    console.log(wpos);       
    rotMat = cesium.eastNorthUpToFixedFrame(wpos);    
    console.log(rotMat);

    if (!scene.extensions) {
      scene.extensions = {};      
    }
    scene.extensions['CESIUM_RTC'] = pos;
  }

  const bufferPromises = [];
  Object.keys(scene.buffers).forEach(function (bufferId) {
    const buffer = scene.buffers[bufferId];

    // We don't know how to deal with other types of buffers yet.
    const type = buffer.type;

    if (type && type !== 'arraybuffer') {
      throw new Error(util.format('buffer type "%s" not supported: %s', type, bufferId));
    }

    const promise = addToBody(buffer.uri).then(function (obj) {
      // Set the buffer value to the offset temporarily for easier manipulation of bufferViews.
      buffer.byteOffset = obj.offset;
    });

    bufferPromises.push(promise);
  });  

  // Run this on the existing buffers first so that the buffer view code can read from it.
  return Promise.all(bufferPromises).return(scene);
}).then(function (scene) {
  Object.keys(scene.bufferViews).forEach(function (bufferViewId) {
    const bufferView = scene.bufferViews[bufferViewId];
    const bufferId = bufferView.buffer;
    const referencedBuffer = scene.buffers[bufferId];

    if (!referencedBuffer) {
      throw new Error(util.format('buffer ID reference not found: %s', bufferId));
    }

    bufferView.buffer = BUFFER_NAME;
    bufferView.byteOffset += referencedBuffer.byteOffset;
  });

  const promises = [];
  if (embed.shaders) Object.keys(scene.shaders).forEach(function (shaderId) {
    const shader = scene.shaders[shaderId];
    const uri = shader.uri;
    shader.uri = '';

    const promise = addToBody(uri).then(function (obj) {
      const bufferViewId = 'binary_shader_' + shaderId;
      shader.extensions = { KHR_binary_glTF: { bufferView: bufferViewId } };

      scene.bufferViews[bufferViewId] =
        { buffer: BUFFER_NAME
        , byteLength: obj.length
        , byteOffset: obj.offset
        };
    });

    promises.push(promise);
  });

  if (embed.textures) {
    // TODO: embed images into body (especially if already embedded as base64)
    if (scene.images) {
      Object.keys(scene.images).forEach(function (imageId) {
        const image = scene.images[imageId];
        const uri = image.uri;

        const promise = addToBody(uri).then(function (obj) {
          const bufferViewId = 'binary_images_' + imageId;
          // TODO: add extension properties
          image.extensions =
            { KHR_binary_glTF:
              { bufferView: bufferViewId
              , mimeType: 'image/i-dont-know'
              , height: 9999
              , width: 9999
              }
            };

          scene.bufferViews[bufferViewId] =
            { buffer: BUFFER_NAME
            , byteLength: obj.length
            , byteOffset: obj.offset
            };
        });

        promises.push(promise);
      });
    }
  }

  return Promise.all(promises).return(scene);
}).then(function (scene) {
  // All buffer views now reference the implicit "binary_glTF" buffer, so it is no longer needed.
  if (argv.cesium) {
    // Cesium seems to run into issues if this is not defined, even though it shouldn't be needed.
    scene.buffers =
      { KHR_binary_glTF:
        { uri: ''
        , byteLength: bodyLength
        }
      };
  }
  else scene.buffers = undefined;   

  //replace matrix
  // if (scene.nodes) {
  //   Object.keys(scene.nodes).forEach(function(nodeName) {
  //     var node = scene.nodes[nodeName];
  //     if (node.name != 'Y_UP_Transform') {
  //       node.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];  
  //     }      
  //   });
  // }

  //replace shader
  if (argv.vs || argv.fs) {
    if (scene.shaders) {
      Object.keys(scene.shaders).forEach(function(shaderId) {      
        var shader = scene.shaders[shaderId];
        if (shader.type) {
          if (argv.fs && shader.type === 35632) {
            shader.uri = argv.fs;
          }
          if (argv.vs && shader.type === 35633) {
            shader.uri = argv.vs;
          }
        }
      }); 
    }
  }

  // manipulate vertex
  var maxX, maxY, maxZ, maxHeight;
  var minX, minY, minZ, minHeight;  
  maxX = maxY = maxZ = maxHeight = Number.MIN_VALUE;
  minX = minY = minZ = minHeight = Number.MAX_VALUE;
  if (lon && lat) {
    if (scene.meshes) {
      Object.keys(scene.meshes).forEach(function(meshName) {
        var mesh = scene.meshes[meshName];
        console.log(meshName);
        if (mesh.primitives) {
          for (let i = 0; i < mesh.primitives.length; ++i) {            
            var obj = mesh.primitives[i];
            var an = obj.attributes.POSITION;
            if (an) {
              var a = scene.accessors[an];
              var bv = scene.bufferViews[a.bufferView];

              var offset = bv.byteOffset + a.byteOffset;
              const contents = bodyParts[1];
              var f32 = new Float32Array(contents.buffer, contents.byteOffset + offset, a.byteStride * a.count / Float32Array.BYTES_PER_ELEMENT);

              for (let j = 0; j < f32.length; j+=3) {
                var x = f32[j];
                var y = f32[j + 1];
                var z = f32[j + 2];   

                if (z > maxHeight) {
                  maxHeight = z;
                }                                 
                if (z < minHeight) {
                  minHeight = z;
                }

                f32[j]      = rotMat[0] * x + rotMat[1] * y + rotMat[2] * z;
                f32[j + 1]  = rotMat[4] * x + rotMat[5] * y + rotMat[6] * z;
                f32[j + 2]  = rotMat[8] * x + rotMat[9] * y + rotMat[10] * z;                

                x = f32[j];
                y = f32[j + 1];
                z = f32[j + 2];

                if (x > maxX) {
                  maxX = x;
                }
                if (y > maxY) {
                  maxY = y;
                }
                if (z > maxZ) {
                  maxZ = z;
                }

                if (x < minX) {
                  minX = x;
                }
                if (y < minY) {
                  minY = y;
                }
                if (z < minZ) {
                  minZ = z;
                }
              }
            }
          }
        }
      });
    }

  }


  if (scene.techniques) {
    Object.keys(scene.techniques).forEach(function(techId) {
      var tech = scene.techniques[techId];
      if (tech.states) {
        var en = tech.states.enable;
        if (en) {          
          var idx = -1;
          for (let i = 0; i < en.length; ++i) {
            // remove blending
            if (en[i] === 3042) {
              idx = i;
              break;
            }            
          }  
          if (idx != -1) {
            en.splice(idx, 1);            
          }        
        }   
      }

      if (argv.b3dm) {
        if (tech.attributes) {
          tech.attributes['a_batchId'] = 'batchId';
        }
        if (tech.parameters) {
          tech.parameters['batchId'] = {
            semantic: 'BATCHID',
            type: 5126
          };
        }
      }

      if (argv.rtc) {        
        if (tech.parameters && tech.parameters.modelViewMatrix) {
          tech.parameters.modelViewMatrix['semantic'] = 'CESIUM_RTC_MODELVIEW';
        }
      }
    });
  }

  if (argv.bounds && lon && lat) {    
    var h  = maxHeight - minHeight; 
    // console.log(h, maxHeight, minHeight);       

    var left   = worldPos.x + minX;
    var right  = worldPos.x + maxX;    
    var front  = worldPos.y + minY;
    var back   = worldPos.y + maxY;    
    var bottom = worldPos.z + minZ;
    var top    = worldPos.z + maxZ;

    // var bottom  = worldPos.y + minY;
    // var top     = worldPos.y + maxY;    
    // var front   = worldPos.z + minZ;
    // var back    = worldPos.z + maxZ;


    // console.log('minX', minX);
    // console.log('maxX', maxX);
    // console.log('minY', minY);
    // console.log('maxY', maxY);
    // console.log('minZ', minZ);
    // console.log('maxZ', maxZ);
    // console.log(minX, maxX, minY, maxY, minZ, maxZ);
    // console.log(left, right, front, back, bottom, top);

    // create bounding box, starts from left, front, bottom and continue clock wise, from front face to back
    var p1 = {x: left,  y: front, z: bottom};
    var p2 = {x: left,  y: front, z: top};
    var p3 = {x: right, y: front, z: top};
    var p4 = {x: right, y: front, z: bottom};
    var p5 = {x: left,  y: back,  z: bottom};
    var p6 = {x: left,  y: back,  z: top};
    var p7 = {x: right, y: back,  z: top};
    var p8 = {x: right, y: back,  z: bottom};

    var lons = [], lats = [];
    var g;
    g = cesium.fromCartesian(p1);
    lons.push(g.lon); lats.push(g.lat);
    g = cesium.fromCartesian(p2);
    lons.push(g.lon); lats.push(g.lat);
    g = cesium.fromCartesian(p3);
    lons.push(g.lon); lats.push(g.lat);
    g = cesium.fromCartesian(p4);
    lons.push(g.lon); lats.push(g.lat);
    g = cesium.fromCartesian(p5);
    lons.push(g.lon); lats.push(g.lat);
    g = cesium.fromCartesian(p6);
    lons.push(g.lon); lats.push(g.lat);
    g = cesium.fromCartesian(p7);
    lons.push(g.lon); lats.push(g.lat);
    g = cesium.fromCartesian(p8);
    lons.push(g.lon); lats.push(g.lat);

    var comp = function(a, b) {
      return a - b;
    }

    lons.sort(comp);
    lats.sort(comp);    

    // console.log(lons, lats);

    // west, south, east, north, minimum height, maximum height
    var bounds = {
      region: [
        lons[0],
        lats[0],
        lons[lons.length - 1],
        lats[lats.length - 1],
        0,
        h
      ]
    };

    var str = JSON.stringify(bounds);
    const len = Buffer.byteLength(str);


    // console.log(worldPos);
    // var geo = cesium.fromCartesian(worldPos);
    // console.log(geo);    

    var fn = argv.bounds;
    if (!fn.endsWith('.json')) {
      fn = fn + '.json';
    }
    fn = path.join(path.dirname(filename), fn);    

    const bFile = new Buffer(len);
    bFile.write(str);
    fs.writeFileAsync(fn, bFile);
  }

  const newSceneStr = JSON.stringify(scene);  
  // console.log(argv.cesium);
  // console.log(newSceneStr);
  const sceneLength = Buffer.byteLength(newSceneStr);
  // As body is 4-byte aligned, the scene length must be padded to have a multiple of 4.
  // jshint bitwise:false
  const paddedSceneLength = (sceneLength + 3) & ~3;
  // jshint bitwise:true

  // Header is 20 bytes long.
  var bodyOffset = paddedSceneLength + 20;
  const fileLength = bodyOffset + bodyLength;

  // Let's create our GLB file!
  var bufferLength = fileLength;
  if (argv.b3dm) {
    bufferLength = bufferLength + 20;   
    bodyOffset += 20;
  }

  const glbFile = new Buffer(bufferLength);
  var pad = 0;

  if (argv.b3dm) {    
    // create b3dm without metadata
    glbFile.writeUInt32BE(0x6233646D, pad);
    glbFile.writeUInt32LE(1, pad += 4);  //version
    glbFile.writeUInt32LE(bufferLength, pad += 4);  //filesize
    glbFile.writeUInt32LE(1, pad += 4);  //model count
    glbFile.writeUInt32LE(0, pad += 4);  //batch table length    
  }

  // Magic number (the ASCII string 'glTF').
  glbFile.writeUInt32BE(0x676C5446, pad += 4);

  // Binary GLTF is little endian.
  // Version of the Binary glTF container format as a uint32 (vesrion 1).
  glbFile.writeUInt32LE(1, pad += 4);

  // Total length of the generated file in bytes (uint32).
  glbFile.writeUInt32LE(fileLength, pad += 4);

  // Total length of the scene in bytes (uint32).
  glbFile.writeUInt32LE(paddedSceneLength, pad += 4);

  // Scene format as a uint32 (JSON is 0).
  glbFile.writeUInt32LE(0, pad += 4);

  // Write the scene.
  glbFile.write(newSceneStr, pad += 4);  

  // Add spaces as padding to ensure scene is a multiple of 4 bytes.
  for (let i = sceneLength + pad; i < bodyOffset; ++i) glbFile[i] = 0x20;

  // Write the body.
  for (let i = 0; i < bodyParts.length; i += 2) {
    const offset = bodyParts[i];
    const contents = bodyParts[i + 1];
    contents.copy(glbFile, bodyOffset + offset);
  }

  return fs.writeFileAsync(filename.replace(/\.gltf$/, argv.b3dm ? '.b3dm' : '.glb'), glbFile);
}).error(function (error) {
  console.error('Failed to create binary GLTF file:');
  console.error('----------------------------------');
  console.error(error);
});
