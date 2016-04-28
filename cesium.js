
const RADIANS_PER_DEGREE = Math.PI / 180.0;
const EPSILON14 = 0.00000000000001;

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
	return Math.sqrt(magnitudeSquared(v));
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
}

function dot(left, right) {        
    return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left, right, result) {    
    var leftX = left.x;
    var leftY = left.y;
    var leftZ = left.z;
    var rightX = right.x;
    var rightY = right.y;
    var rightZ = right.z;

    var x = leftY * rightZ - leftZ * rightY;
    var y = leftZ * rightX - leftX * rightZ;
    var z = leftX * rightY - leftY * rightX;

    result.x = x;
    result.y = y;
    result.z = z;
    return result;
}

function divideByScalar(cartesian, scalar, result) {    
    result.x = cartesian.x / scalar;
    result.y = cartesian.y / scalar;
    result.z = cartesian.z / scalar;
    return result;
}

function multiplyByScalar(cartesian, scalar, result) {
    result.x = cartesian.x * scalar;
    result.y = cartesian.y * scalar;
    result.z = cartesian.z * scalar;
    return result;
}

function equalsEpsilon(left, right, epsilon) {    
    var absDiff = Math.abs(left - right);
    return absDiff <= epsilon || absDiff <= epsilon * Math.max(Math.abs(left), Math.abs(right));
}

function sign(value) {
    if (value > 0) {
        return 1;
    }
    if (value < 0) {
        return -1;
    }

    return 0;
}

function oneOverRadiiSquared(v) {
    return {
        x: v.x === 0.0 ? 0.0 : 1.0 / (v.x * v.x),
        y: v.y === 0.0 ? 0.0 : 1.0 / (v.y * v.y),
        z: v.z === 0.0 ? 0.0 : 1.0 / (v.z * v.z)
    };
}

function geodeticSurfaceNormal(cartesian) {
    var ellipsoid = {
        x: 6378137.0, 
        y: 6378137.0, 
        z: 6356752.3142451793
    }; 
    var oors = oneOverRadiiSquared(ellipsoid);
    var result = {};
    multiplyComponents(cartesian, oors, result);    

    var m = magnitude(result);    
    return normalize(result, result);        
}

// row matrix
exports.eastNorthUpToFixedFrame = function(origin) {    
    if (equalsEpsilon(origin.x, 0.0, EPSILON14) &&
        equalsEpsilon(origin.y, 0.0, EPSILON14)) {
        var sign = sign(origin.z);
        return [
            0.0, -sign,  0.0, origin.x,
            1.0,   0.0,  0.0, origin.y,
            0.0,   0.0, sign, origin.z,
            0.0,   0.0,  0.0, 1.0
        ];
    }    
    
    var normal = geodeticSurfaceNormal(origin);
    // console.log(normal);

    var tangent = {
        x: -origin.y,
        y: origin.x,
        z: 0.0
    }    
    normalize(tangent, tangent);

    var bitangent = {};
    cross(normal, tangent, bitangent);
    
    return [
        tangent.x, bitangent.x, normal.x, origin.x,
        tangent.y, bitangent.y, normal.y, origin.y,
        tangent.z, bitangent.z, normal.z, origin.z,
        0.0,       0.0,         0.0,      1.0
    ];    
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