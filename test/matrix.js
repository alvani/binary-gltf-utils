'use strict';

const test = require('../matrix');
const math = require('mathjs');

const EPSILON = 0.00000000000001;

function matrixEqual(m1, m2, eps) {
	var pass = true;
	m1.forEach(function (value, index, matrix) {		
		var value2 = m2.subset(math.index(index[0], index[1]));
		var d = Math.abs(value2 - value);		
		var e = eps | 0;
		if (d > eps) {
			pass = false;
			return false;
		}
	});
	return pass;
}

function vectorEqual(v1, v2, eps) {
	var pass = true;
	v1.forEach(function (value, index, matrix) {		
		var value2 = v2.subset(math.index(index[0]));
		var d = Math.abs(value2 - value);		
		if (d > eps) {
			pass = false;
			return false;
		}
	});
	return pass;
}

function testCreateRotationMatrix() {
	var pass = true;
	var v = math.matrix([1, 1, 1, 1]);
	var m = test.createRotationMatrix(90, 0, 0);
	var r = math.multiply(m, v);

	var v2 = math.matrix([-1, 1, 1, 1]);	
	pass = pass && subTest('yaw 90', vectorEqual(r, v2, EPSILON));

	m = test.createRotationMatrix(0, 90, 0);
	r = math.multiply(m, v);
	v2 = math.matrix([1, -1, 1, 1]);	
	pass = pass && subTest('pitch 90', vectorEqual(r, v2, EPSILON));

	m = test.createRotationMatrix(0, 0, 90);
	r = math.multiply(m, v);
	v2 = math.matrix([-1, 1, 1, 1]);	
	pass = pass && subTest('roll 90', vectorEqual(r, v2, EPSILON));

	m = test.createRotationMatrix(90, 0, 0, true);
	r = math.multiply(m, v);
	v2 = math.matrix([1, -1, 1, 1]);	
	pass = pass && subTest('yaw 90 cw', vectorEqual(r, v2, EPSILON));

	m = test.createRotationMatrix(0, 90, 0, true);
	r = math.multiply(m, v);
	v2 = math.matrix([1, 1, -1, 1]);	
	pass = pass && subTest('pitch 90 cw', vectorEqual(r, v2, EPSILON));

	m = test.createRotationMatrix(0, 0, 90, true);
	r = math.multiply(m, v);
	v2 = math.matrix([1, 1, -1, 1]);	
	pass = pass && subTest('roll 90 cw', vectorEqual(r, v2, EPSILON));
	
	return pass;
}

function testCreateScaleMatrix() {
	var m1 = test.createScaleMatrix(1, 2, 3);
	var m2 = math.matrix([
		[1, 0, 0, 0],
		[0, 2, 0, 0],
		[0, 0, 3, 0],
		[0, 0, 0, 1]
	]);
	if (!matrixEqual(m1, m2)) {
		return false;
	}		

	return true;
}

function testArrToMatrix() {
	var arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];	
	var m = math.matrix([
		[1, 2, 3, 4],
		[5, 6, 7, 8],
		[9, 10, 11, 12],
		[13, 14, 15, 16],
	]);
	var am = test.arrToMatrix(arr);

	if (!matrixEqual(m, am)) {
		return false;
	}		

	return true;
}

function testArrToMatrixColumn() {
	var arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];	
	var m = math.matrix([
		[1, 5, 9, 13],
		[2, 6, 10, 14],
		[3, 7, 11, 15],
		[4, 8, 12, 16],
	]);
	var am = test.arrToMatrix(arr, true);

	if (!matrixEqual(m, am)) {
		return false;
	}		

	return true;
}

function testCreateUnityRotationMatrix() {
	var pass = true;
	var yaw = 180;
	var pitch = 0;
	var roll = 180;

	var uniMat = test.createUnityRotationMatrix(yaw, pitch, roll);

	// these values are obtained from unity
	var arr = [
		1, 0, 0, 0,
		0, -1, 0, 0,
		0, 0, -1, 0,
		0, 0, 0, 1,
	];
	var m = test.arrToMatrix(arr, true); // unity matrix is column major

	pass = pass && subTest('yaw=180 pitch=0 roll=180', matrixEqual(uniMat, m, EPSILON));

	yaw = 0, pitch = -90, roll = 0;
	arr = [
		1, 0, 0, 0,
		0, 0, 1, 0,
		0, -1, 0, 0,
		0, 0, 0, 1
	];
	m = test.arrToMatrix(arr, true);
	uniMat = test.createUnityRotationMatrix(yaw, pitch, roll);

	pass = pass && subTest('yaw=0 pitch=-90 roll=0', matrixEqual(uniMat, m, EPSILON));

	return pass;
}

function testGetLocalTransformFromDotPos() {
	var pass = true;

	// .pos trans = local trans * unity trans * blender trans on unity coord clock wise rot
	// we need to extract local trans from .pos trans
	// .pos trans = local trans * (unity trans * blender);
	// .pos trans * inv(unity trans * blender) = local trans	

	var uniMat = test.createRotationMatrix(0, -90, 0, true); // unity will transform -90 cw x axis from blender file
	var blendMat = test.createRotationMatrix(0, -90, 0, true); // simulated blender transfom, arbitrary values
	var tm = math.multiply(uniMat, blendMat);	
	var tmTrans = math.transpose(tm);	// = inv(unity trans * blender) = transponse(unity trans * blender)

	// m = transform.localToWorldMatrix value on Unity 
	// obtained from blender mesh with -90 x axis rotation internal .blend transform
	// (actually blender has ccw rotation but unity import is not converting the values,
	//  something to do with row/col matrix and coordinate system used)
	var arr = [
		1, 0, 0, 0,
		0, -1, 0, 0,
		0, 0, -1, 0,
		0, 0, 0, 1,
	];
	var m = test.arrToMatrix(arr, true); // unity matrix is column major

	pass = pass && subTest('matrix -90 x axis test', matrixEqual(tmTrans, m, EPSILON));

	return pass;

}

function doTest(func) {
	console.log('running', func.name, '...');
	var result = func();
	console.log(result ? 'passed' : 'failed');
}

function subTest(name, result) {
	console.log('  subtest', name, result ? 'passed' : 'failed');
	return result;
}

exports.test = function (argument) {
	var funcs = [
		testCreateRotationMatrix,
		testCreateScaleMatrix,
		testArrToMatrix,
		testArrToMatrixColumn,
		testCreateUnityRotationMatrix,
		testGetLocalTransformFromDotPos
	];

	funcs.forEach(function(value) {
		doTest(value);
	});	
};

