#!/usr/bin/env node

'use strict';

const Promise = require('bluebird');
const path = require('path');
const util = require('util');
const math = require('mathjs');
const fs = Promise.promisifyAll(require('fs'));
const cesium = require('./cesium');
const matrix = require('./matrix');
const injectNodes = require('./injectNodes').injectNodes;

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
	.string('height')
	.describe('height', 'height for rtc')	
	.string('bounds')
	.describe('bounds', 'filename for .json thath contains bounds')
	.string('scaleX')
	.describe('scaleX', 'scale value for x axis')
	.string('scaleY')
	.describe('scaleY', 'scale value for x axis')
	.string('scaleZ')
	.describe('scaleZ', 'scale value for x axis')  
	// ccw, z up x front y right
	.string('yaw')
	.describe('yaw', 'yaw value in degrees')
	.string('pitch')
	.describe('pitch', 'pitch value in degrees')
	.string('roll')
	.describe('roll', 'roll value in degrees')
	.help('h')
	.alias('h', 'help')
	.argv;

//test
// var matId = math.matrix([[4, 0, 0], [0, 5, 0], [0, 0, 6]]);
// var vec = math.matrix([1, 1, 1]);
// var result = math.multiply(matId, vec);
// console.log(result);

var lon, lat, height;
if (argv.rtc) {
	if (!argv.lon || !argv.lat || !argv.height) {
		console.error('Pleasep provide [lon] [lat] [height] parameter after --rtc');
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
	height = parseFloat(argv.height);
	if (!height) {
		console.error('Pleasep provide valid [height] value');
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
	else {
		var duri = decodeURI(uri);    
		promise = fs.readFileAsync(path.join(containingFolder, duri));
	}

	return promise.then(function (contents) {
		const offset = bodyLength;
		bodyParts.push(offset, contents);  
		const length = contents.length;
		bodyLength += length;
		return { offset, length };
	});
}

function arrGLTFToMatrix(arr) {  
	return matrix.arrToMatrix(arr, true);
}

function applyTransform(node) {  
	var m = node.worldMatrix ? node.worldMatrix : node.matrix;
	for (let i = 0; i < node.children.length; ++i) {
		var c = node.children[i];
		c.worldMatrix = math.multiply(m, c.matrix);
		applyTransform(c);
	}  
}

var nodes = {};
function createSceneNode(scene) {  
	if (scene.nodes) {    
		// collect nodes
		nodes = {};
		var keys = Object.keys(scene.nodes);
		keys.forEach(function(nodeName) {
			var sceneNode = scene.nodes[nodeName];
			nodes[nodeName] = {
				name: nodeName,   
				matrix: matrix.arrToMatrix(sceneNode.matrix),  
				children: []
			}      
		});

		keys.forEach(function(nodeName) {      
			var sceneNode = scene.nodes[nodeName];
			var node = nodes[nodeName];
			if (sceneNode.children && sceneNode.children.length > 0) {          
				for (let j = 0; j < sceneNode.children.length; ++j) {
					var childName = sceneNode.children[j];
					if (childName in nodes) {
						node.children.push(nodes[childName]);
						nodes[childName].parent = node;
					}
				}
			}
		});     

		keys.forEach(function(nodeName) {
			var node = nodes[nodeName];
			if (!node.parent) {
				applyTransform(node);        
			}
		});    

		console.log(nodes);
	}
}

fs.readFileAsync(filename, 'utf-8').then(function (gltf) {
	// Modify the GLTF data to reference the buffer in the body instead of external references.
	const scene = JSON.parse(gltf);
	injectNodes(scene, path.dirname(filename));	
	// console.log(JSON.stringify(scene));

	// Let a GLTF parser know that it is using the Binary GLTF extension.
	if (Array.isArray(scene.extensionsUsed)) scene.extensionsUsed.push('KHR_binary_glTF');
	else scene.extensionsUsed = [ 'KHR_binary_glTF' ];

	if (argv.rtc) {
		scene.extensionsUsed.push('CESIUM_RTC');

		height = 0;
		console.log('lon', lon, 'lat', lat, 'height', height);
		var wpos = cesium.fromDegrees(lon, lat, height);
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

	// replace matrix
	var blendRot;
	if (scene.nodes) {
		var meshes;    
		Object.keys(scene.nodes).forEach(function(nodeName) {
			var node = scene.nodes[nodeName];

			if (node.name != 'Y_UP_Transform') {        
				blendRot = node.matrix;
				node.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];  
			} 

			// if (node.name == 'Y_UP_Transform') {
			//   console.log('matrix y up replaced');
			//   node.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];  
			// }      
			// node.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; 

			// if (node.meshes) {
			//   meshes = node.meshes;
			//   delete node['meshes'];
			//   node.children = ['b3dm'];
			// }       
		});

		var uniMat = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1];
		// var uniMat = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1];    
		// var uniMat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];


		//create b3dm node
		var m = rotMat.slice();
		//clear translation
		// m[3] = m[7] = m[11] = 0;

		m[0] = rotMat[0];
		m[1] = rotMat[4];
		m[2] = rotMat[8];
		m[3] = rotMat[12];
		m[4] = rotMat[1];
		m[5] = rotMat[5];
		m[6] = rotMat[9];
		m[7] = rotMat[13];
		m[8] = rotMat[2];
		m[9] = rotMat[6];
		m[10] = rotMat[10];
		m[11] = rotMat[14];
		m[12] = 0;
		m[13] = 0;
		m[14] = 0;
		m[15] = rotMat[15];

		// scene.nodes['b3dm'] = {
		//   children: [],
		//   matrix: m,
		//   meshes: meshes,
		//   name: 'b3dm'
		// };

		// scene.nodes['b3dm'] = {
		//   children: ['node_1'],
		//   matrix: m,      
		//   name: 'b3dm'
		// };

		// scene.nodes['b3dm'] = {
		//   children: ['uni'],
		//   matrix: m,      
		//   name: 'b3dm'
		// };

		// scene.nodes['uni'] = {
		//   children: [],
		//   matrix: uniMat,
		//   meshes: meshes,
		//   name: 'uni'
		// };
		
		// scene.scenes.defaultScene.nodes = ['b3dm'];    
	}	

	var sn = createSceneNode(scene);

	// manipulate vertex
	var maxX, maxY, maxZ, maxHeight;
	var minX, minY, minZ, minHeight;  
	maxX = maxY = maxZ = maxHeight = Number.MIN_VALUE;
	minX = minY = minZ = minHeight = Number.MAX_VALUE;
	var scaleX = parseFloat(argv.scaleX);
	var scaleY = parseFloat(argv.scaleY);
	var scaleZ = parseFloat(argv.scaleZ);
	var yaw = parseFloat(argv.yaw);
	var pitch = parseFloat(argv.pitch);
	var roll = parseFloat(argv.roll);  
		

	function testBlendRot() {
		var m = arrGLTFToMatrix(blendRot);
		var vec = math.matrix([1, 1, 1, 1]);
		var result = math.multiply(m, vec);
		console.log(m);

		// var xi = 1;
		// var yi = 1;      
		// var zi = 1;
		// var wi = 1;

		// var x  = blendRot[0] * xi + blendRot[4] * yi + blendRot[8]  * zi + blendRot[12] * wi;
		// var y  = blendRot[1] * xi + blendRot[5] * yi + blendRot[9]  * zi + blendRot[13] * wi;
		// var z  = blendRot[2] * xi + blendRot[6] * yi + blendRot[10] * zi + blendRot[14] * wi;
		// var w  = blendRot[3] * xi + blendRot[7] * yi + blendRot[11] * zi + blendRot[15] * wi;
		// console.log(x, y, z, w);
	}

	function testMatrix() {
		// var v = math.matrix([1, 1, 1, 1]);
		// var rm = createRotationMatrix(0, -90, 0);  
		// console.log(rm);

		// testBlendRot();
		// console.log(math.multiply(rm, v));

		// var v = math.matrix([1, 0, 0, 1]);
		// var rm = createRotationMatrix(0, 0, 90);
		// var sm = createScaleMatrix(1, 1, 2);
		// var tm = math.multiply(rm, sm);

		// var result = math.multiply(tm, v);

		var uniMat = matrix.createRotationMatrix(0, -90, 0);
		var blendMat = arrGLTFToMatrix(blendRot);
		var tm = math.multiply(uniMat, blendMat);	
		var tmTrans = math.transpose(tm);

		console.log(yaw, pitch, roll);
		var posMat = matrix.createUnityRotationMatrix(yaw, pitch, roll);		
		tm = math.multiply(posMat, tmTrans);

		console.log(tm);
	}	

	// testMatrix();

	if (rotMat || scaleX || scaleY || scaleZ) {
		if (scene.meshes) {			
			var localMat;
			if (blendRot && (yaw || pitch || roll)) {
				yaw = yaw | 0;
				pitch = pitch | 0;
				roll = roll | 0;				
				
				// blendRot is ccw, column
				// blendMat is cw, row  
				var blendMat = matrix.arrToMatrix(blendRot); // implicitly inversed
				localMat = matrix.createUnityLocalRotationMatrix(blendMat, yaw, pitch, roll);

				// should it be rotated 180 to match cesium coord ??
				var adjMat = matrix.createUnityRotationMatrix(0, 0, 180);
				localMat = math.multiply(adjMat, localMat);
			}

			var accessorEdited = {};
			Object.keys(scene.meshes).forEach(function(meshName) {
				var mesh = scene.meshes[meshName];
				console.log(meshName);
				if (mesh.primitives) {
					for (let i = 0; i < mesh.primitives.length; ++i) {            
						var obj = mesh.primitives[i];
						var an = obj.attributes.POSITION;

						if (an && !(an in accessorEdited)) {
							accessorEdited[an] = true;

							var a = scene.accessors[an];
							var bv = scene.bufferViews[a.bufferView];

							var offset = bv.byteOffset + a.byteOffset;
							const contents = bodyParts[1];
							var f32 = new Float32Array(contents.buffer, contents.byteOffset + offset, a.byteStride * a.count / Float32Array.BYTES_PER_ELEMENT);

							for (let j = 0; j < f32.length; j+=3) { 
								var x = f32[j];
								var y = f32[j + 1];
								var z = f32[j + 2];
								
								if (blendRot) {
								  x = f32[j];
								  y = f32[j + 1];
								  z = f32[j + 2];

								  f32[j]      = blendRot[0] * x + blendRot[4] * y + blendRot[8] * z;
								  f32[j + 1]  = blendRot[1] * x + blendRot[5] * y + blendRot[9] * z;
								  f32[j + 2]  = blendRot[2] * x + blendRot[6] * y + blendRot[10] * z;
								}

								z = f32[j + 2];

								if (z > maxHeight) {
									maxHeight = z;
								}                                 
								if (z < minHeight) {
									minHeight = z;
								}

								if (localMat) {
									var arr = [f32[j], f32[j + 1], f32[j + 2], 1];
									arr = matrix.multiplyVectorArr(localMat, arr);
									f32[j] = arr[0]; 
									f32[j + 1] = arr[1]; 
									f32[j + 2] = arr[2]; 
								}

								if (scaleX) {
									f32[j] *= scaleX;
								}
								if (scaleY) {
									f32[j + 1] *= scaleY;
								}
								if (scaleZ) {
									f32[j + 2] *= scaleZ;
								}

								// if (yaw) {
								// 	var x = f32[j];
								// 	var y = f32[j + 1];                  

								// 	var a = cesium.toRadians(yaw);
								// 	var cosa = Math.cos(a);
								// 	var sina = Math.sin(a);

								// 	f32[j]      = cosa * x + -sina * y;
								// 	f32[j + 1]  = sina * x + cosa * y;                  
								// }

								// if (pitch) {
								// 	var x = f32[j];                  
								// 	var z = f32[j + 2];

								// 	var a = cesium.toRadians(pitch);
								// 	var cosa = Math.cos(a);
								// 	var sina = Math.sin(a);

								// 	f32[j]      = cosa * x + -sina * z;
								// 	f32[j + 2]  = sina * x + cosa * z;  
								// }

								// if (roll) {                  
								// 	var y = f32[j + 1];
								// 	var z = f32[j + 2];

								// 	var a = cesium.toRadians(roll);
								// 	var cosa = Math.cos(a);
								// 	var sina = Math.sin(a);

								// 	f32[j + 1]  = cosa * y + sina * z;
								// 	f32[j + 2]  = -sina * y + cosa * z; 
								// }                   								                                

								if (rotMat) {
									x = f32[j];
									y = f32[j + 1];
									z = f32[j + 2];

									f32[j]      = rotMat[0] * x + rotMat[1] * y + rotMat[2] * z;
									f32[j + 1]  = rotMat[4] * x + rotMat[5] * y + rotMat[6] * z;
									f32[j + 2]  = rotMat[8] * x + rotMat[9] * y + rotMat[10] * z;  
									// var sx = x;
									// var sy = -z;
									// var sz = y;

									// f32[j]      = rotMat[0] * sx + rotMat[1] * sy + rotMat[2] * sz;
									// f32[j + 1]  = rotMat[4] * sx + rotMat[5] * sy + rotMat[6] * sz;
									// f32[j + 2]  = rotMat[8] * sx + rotMat[9] * sy + rotMat[10] * sz;                        
								}                

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

						var an = obj.attributes.NORMAL;
						if (an && !(an in accessorEdited)) {
							accessorEdited[an] = true;

							var a = scene.accessors[an];
							var bv = scene.bufferViews[a.bufferView];

							var offset = bv.byteOffset + a.byteOffset;
							const contents = bodyParts[1];
							var f32 = new Float32Array(contents.buffer, contents.byteOffset + offset, a.byteStride * a.count / Float32Array.BYTES_PER_ELEMENT);

							for (let j = 0; j < f32.length; j+=3) { 
								var x = f32[j];
								var y = f32[j + 1];
								var z = f32[j + 2];
								
								if (blendRot) {
								  x = f32[j];
								  y = f32[j + 1];
								  z = f32[j + 2];

								  f32[j]      = blendRot[0] * x + blendRot[4] * y + blendRot[8] * z;
								  f32[j + 1]  = blendRot[1] * x + blendRot[5] * y + blendRot[9] * z;
								  f32[j + 2]  = blendRot[2] * x + blendRot[6] * y + blendRot[10] * z;
								}

								if (localMat) {
									var arr = [f32[j], f32[j + 1], f32[j + 2], 1];
									arr = matrix.multiplyVectorArr(localMat, arr);
									f32[j] = arr[0]; 
									f32[j + 1] = arr[1]; 
									f32[j + 2] = arr[2]; 
								}             								                                

								if (rotMat) {
									x = f32[j];
									y = f32[j + 1];
									z = f32[j + 2];

									f32[j]      = rotMat[0] * x + rotMat[1] * y + rotMat[2] * z;
									f32[j + 1]  = rotMat[4] * x + rotMat[5] * y + rotMat[6] * z;
									f32[j + 2]  = rotMat[8] * x + rotMat[9] * y + rotMat[10] * z;									
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
