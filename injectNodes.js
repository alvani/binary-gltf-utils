'use strict';

const path = require('path');
const fs = require('fs');

var objList = {
	'CARP_RUMPUT-effect': {
		merge: [
			'TechCarpet1',
			'MatCarpRumput'
		],
		textures: [
			'Rumput03.png'
		]
	},		
	'CARP_ASPHALT-effect': {
		merge: [
			'TechCarpet1',
			'MatCarpAsphalt'
		],
		textures: [
			'Asphalt03.png'
		]
	}
};

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

exports.injectNodes = function(scene, outDir) {
	replaceDefaultShaders(scene);
	modifyTechniques(scene);

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
				fs.linkSync(srcPath, dstPPath);				
			}
		}

	});	
};