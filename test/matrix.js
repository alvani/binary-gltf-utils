'use strict';

const test = require('../matrix');
const math = require('mathjs');

const EPSILON = 0.00000000000001;

function matrixEqual(m1, m2) {
	var pass = true;
	m1.forEach(function (value, index, matrix) {		
		var value2 = m2.subset(math.index(index[0], index[1]));		
		if (value != value2) {
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
		testArrToMatrixColumn
	];

	funcs.forEach(function(value) {
		doTest(value);
	});	
};

