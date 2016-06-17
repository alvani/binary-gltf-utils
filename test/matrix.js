'use strict';

const test = require('../matrix');
const math = require('mathjs');

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

exports.test = function (argument) {
	var funcs = [
		testArrToMatrix,
		testArrToMatrixColumn
	];

	funcs.forEach(function(value) {
		doTest(value);
	});	
};

