'use strict';

const math = require('mathjs');

function toRadians(degree) {
	return degree * math.pi / 180.0;
}

exports.createRotationMatrix = function(yaw, pitch, roll) {
	var a = toRadians(yaw);
	var cosa = Math.cos(a);
	var sina = Math.sin(a);

	// ccw on z-axis
	var myaw = [
		cosa, -sina, 0, 0,
		sina, cosa, 0, 0,
		0, 0, 1, 0,
		0, 0, 0, 1
	];
	var m = this.arrToMatrix(myaw);					 
	
	a = toRadians(pitch);
	cosa = Math.cos(a);
	sina = Math.sin(a);

	// ccw on x-axis
	var mpitch = [
		1, 0, 0, 0,
		0, cosa, -sina, 0,
		0, sina, cosa, 0,
		0, 0, 0, 1
	];
	var m2 = this.arrToMatrix(mpitch);
	m = math.multiply(m2, m);

	a = toRadians(roll);
	cosa = Math.cos(a);
	sina = Math.sin(a);

	// ccw on y-axis
	var mroll = [
		cosa, 0, -sina, 0,
		0, 1, 0, 0,
		sina, 0, cosa, 0,
		0, 0, 0, 1
	];
	m2 = this.arrToMatrix(mroll);
	m = math.multiply(m2, m);
	return m;
};

exports.createUnityRotationMatrix = function(yaw, pitch, roll) {
	return this.createRotationMatrix(roll, pitch, yaw);
};

exports.createScaleMatrix = function(x, y, z) {
	var arr = [
		x, 0, 0, 0,
		0, y, 0, 0,
		0, 0, z, 0,
		0, 0, 0, 1
	];
	return this.arrToMatrix(arr);
};

exports.arrToMatrix = function(arr, column) {  
	if (column) {
		return math.matrix([
			[arr[0], arr[4], arr[8],  arr[12]],
			[arr[1], arr[5], arr[9],  arr[13]],
			[arr[2], arr[6], arr[10], arr[14]],
			[arr[3], arr[7], arr[11], arr[15]]
		]);
	} else {
		return math.matrix([
			[arr[0],  arr[1],   arr[2],   arr[3]],
			[arr[4],  arr[5],   arr[6],   arr[7]],
			[arr[8],  arr[9],   arr[10],  arr[11]],
			[arr[12], arr[13],  arr[14],  arr[15]]
		]);
	}
};