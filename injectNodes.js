'use strict';

const path = require('path');
const fs = require('fs');

var injList = {
	'CARP_RUMPUT-effect': [
		'TechCarpet1',
		'MatCarpRumput'
	],	
	'CARP_ASPHALT-effect': [
		'TechCarpet1',
		'MatCarpAsphalt'
	]
};

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

exports.injectNodes = function(scene) {
	// load node injector	
	
	var procObjs = {};
	var keys = Object.keys(scene.materials);
	keys.forEach(function(name) {		
		if (name in injList) {			
			var arr = injList[name];
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
		}

	});	
};