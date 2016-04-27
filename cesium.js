
const RADIANS_PER_DEGREE = Math.PI / 180.0;
var wgs84RadiiSquared = {
	x: 6378137.0 * 6378137.0, 
	y: 6378137.0 * 6378137.0, 
	z: 6356752.3142451793 * 6356752.3142451793
};

function toRadians(degrees) {
	return degrees * RADIANS_PER_DEGREE;
}

function magnitudeSquared(v) {
	return v.x * v.x + v.y * v.y + v.z * v.z;
}

function magnitude(v) {
	return magnitudeSquared(v);
}

function normalize(v, result) {
	var m = magnitude(v);

    result.x = v.x / m;
    result.y = v.y / m;
    result.z = v.z / m;

	return result;
}

function multiplyComponents(left, right, result) {
    result.x = left.x * right.x;
    result.y = left.y * right.y;
    result.z = left.z * right.z;
    return result;
};

function dot(left, right) {        
    return left.x * right.x + left.y * right.y + left.z * right.z;
};

function divideByScalar(cartesian, scalar, result) {    
    result.x = cartesian.x / scalar;
    result.y = cartesian.y / scalar;
    result.z = cartesian.z / scalar;
    return result;
};

function multiplyByScalar(cartesian, scalar, result) {
    result.x = cartesian.x * scalar;
    result.y = cartesian.y * scalar;
    result.z = cartesian.z * scalar;
    return result;
};

exports.fromDegrees = function(longitude, latitude, height) {
	var lon = toRadians(longitude);        
	var lat = toRadians(latitude);	

    var cosLatitude = Math.cos(lat);
    var n = {
    	x: cosLatitude * Math.cos(lon),
    	y: cosLatitude * Math.sin(lon),
    	z: Math.sin(lat)
    };
    
    n = normalize(n, n);    

    var radiiSquared = wgs84RadiiSquared;

    var k = {
    	x: 0,
    	y: 0,
    	z: 0
    }
    multiplyComponents(radiiSquared, n, k);
    var gamma = Math.sqrt(dot(n, k));
    k = divideByScalar(k, gamma, k);
    n = multiplyByScalar(n, height, n);

    return {
    	x: k.x + n.x,
    	y: k.y + n.y,
    	z: k.z + n.z
    };
}