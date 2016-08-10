'use strict';

const path = require('path');
const fs = require('fs');

var objList = {
	'CARP_RUMPUT-effect': {
		merge: [
			'TechCarpet1',
			'TexRumput',
			'MatCarpRumput'
		],
		textures: [
			'Rumput03.png'
		]
	},		
	'CARP_ASPHALT-effect': {
		merge: [
			'TechCarpet1',
			'TexAsphalt',
			'MatCarpAsphalt'
		],
		textures: [
			'Asphalt03.png'
		]
	},
	'CARPET2_ASPHALT_LONG-effect': {
		merge: [
			'TechCarpet2',
			'TexAsphaltLong',
			'MatCarpet2AsphaltLong'
		],
		textures: [
			'asphalt_long.png'
		],
		// called after merge and texture copy completed
		callback: [
			swapDiffuseDetail
		]
	},
	'CARPET2_ASPHALT-effect': {
		merge: [
			'TechCarpet2',
			'TexAsphalt',
			'MatCarpet2Asphalt'
		],
		textures: [
			'Asphalt03.png'
		],		
		callback: [
			swapDiffuseDetail
		]
	},
	'CARPET2_GRASS-effect': {
		merge: [
			'TechCarpet2',
			'TexRumput',
			'MatCarpet2Rumput'
		],
		textures: [
			'Rumput03.png'
		],		
		callback: [
			swapDiffuseDetail
		]
	},
	'CARPET2_CONCRETE_TAXIWAY-effect': {
		merge: [
			'TechCarpet2',
			'TexConcreteTaxiway',
			'MatCarpet2Taxiway'
		],
		textures: [
			'Rumput03.png'
		],		
		callback: [
			swapDiffuseDetail
		]
	}
};

function swapDiffuseDetail(scene, name) {
	var val = scene.materials[name].values;
	// swap detail and diffuse
	var tmp = val.diffuse;
	val.diffuse = val.detail;
	val.detail = tmp;
	console.log(val.diffuse, val.detail);
}

const defVShader = 'B3DMVS.glsl';
const defFShader = 'B3DMFS.glsl';

var objCache = {};

function loadObject(name) {
	var fn = path.join('materials', name + '.json');	
	var obj = JSON.parse(fs.readFileSync(fn, 'utf8'));
	objCache[name] = obj;	
}

function mergeNode(scene, object) {
	var keys = Object.keys(object);
	keys.forEach(function(name) {
		if (name in scene) {
			var n = scene[name];			
			var t = Object.prototype.toString.call(n);
			if (t == '[object Object]') {
				// dive deeper
				mergeNode(scene[name], object[name]);
			} else {
				// replace object
				scene[name] = object[name];	
			}								
		} else {
			// append object
			scene[name] = object[name];			
		}
	});
}

function replaceDefaultShaders(scene) {
	if (scene.shaders) {
		Object.keys(scene.shaders).forEach(function(shaderId) {      
			var shader = scene.shaders[shaderId];
			if (shader.type) {
				if (shader.type === 35632) {
					shader.uri = defFShader;
				}
				if (shader.type === 35633) {
					shader.uri = defVShader;
				}
			}
		}); 
	}
}

function modifyTechniques(scene) {
	// add face culling: enable: 2884
	const stateCull = 2884;

	if (scene.techniques) {
		Object.keys(scene.techniques).forEach(function(tid) {
			var t = scene.techniques[tid];
			if (t.states && t.states.enable) {
				var en = t.states.enable;
				var found = false;
				for (var i = 0; i < en.length; ++i) {
					if (en[i] == stateCull) {
						found = true;
						break;
					} 
				}
				if (!found) {
					en.push(stateCull);					
				}
			}

		});
	}	
}

function modifyDayAndNightMaterial(scene) {
	var lname;
	if (scene.images) {
		var exp = /.*_L_png/;
		Object.keys(scene.images).forEach(function(id) {
			var r = exp.exec(id);
			if (r) {
				lname = r[0];				
			}
		});		
	}

	if (lname) {
		var texName = 'texture_' + lname;
		if (scene.textures && !(scene.textures[texName])) {			
			scene.textures[texName] = {
				"format": 6408,
	            "internalFormat": 6408,
	            "sampler": "sampler_0",
	            "source": lname,
	            "target": 3553,
	            "type": 5121
			};			
		}

		function modifyProgram(pname) {
			if (scene.programs && pname in scene.programs) {				
				var p = scene.programs[pname];				

				if (scene.shaders) {
					if (p.fragmentShader in scene.shaders) {
						var fs = scene.shaders[p.fragmentShader];	
						fs.uri = 'EntityFS.glsl';						
					}
					if (p.vertexShader in scene.shaders) {
						var vs = scene.shaders[p.vertexShader];					
						vs.uri = 'EntityVS.glsl';						
					}
				}						
			}
		}

		function modifyTechnique(tname) {
			if (scene.techniques && tname in scene.techniques) {
				var t = scene.techniques[tname];
				t.parameters['lightmap'] = {
                    "type": 35678
                };
                t.uniforms['u_lightmap'] = 'lightmap';
                modifyProgram(t.program);                
			}
		}

		var entTechName = 'EntityTech';

		function injectEntityTech() {			
			if (scene.techniques && !(entTechName in scene.techniques)) {
				var objName = 'TechEntity';
				if (!(objName in objCache)) {
					loadObject(objName);
				}
				var obj = objCache[objName];				
				mergeNode(scene, obj);
			}
		}

		if (scene.materials) {
			Object.keys(scene.materials).forEach(function(mid) {
				var m = scene.materials[mid];
				if (m.values && m.values.diffuse) {
					var dn = m.values.diffuse;
					var exp = /(.*)_C_png/;
					var r = exp.exec(dn);
					if (r) {
						var texName2 = r[1] + '_L_png';
						if (texName == texName2) {
							m.values['lightmap'] = texName;
							injectEntityTech();
							m.technique = entTechName;
							// modifyTechnique(m.technique);
						}						
					}
				}
			});
		}
	}
}

exports.injectNodes = function(scene, outDir) {
	replaceDefaultShaders(scene);
	modifyTechniques(scene);
	modifyDayAndNightMaterial(scene);

	var procObjs = {};
	var keys = Object.keys(scene.materials);
	keys.forEach(function(name) {		
		if (name in objList) {			
			var arr = objList[name].merge || [];
			for (let i = 0; i < arr.length; ++i) {
				var objName = arr[i];				

				if (!(objName in procObjs)) {
					if (!(objName in objCache)) {
						loadObject(objName);
					}
					var obj = objCache[objName];
					mergeNode(scene, obj);
					procObjs[objName] = true;
				}
			}

			arr = objList[name].textures || [];
			for (let i = 0; i < arr.length; ++i) {
				var fn = arr[i];
				var srcPath = path.join('textures', fn)				
				var dstPPath = path.join(outDir, fn);
				try {
					fs.linkSync(srcPath, dstPPath);				
				} catch(err) {				
				}
			}

			arr = objList[name].callback || [];
			for (let i = 0; i < arr.length; ++i) {
				var call = arr[i];
				call(scene, name);
			}
		}

	});	

	// console.log(scene);
};