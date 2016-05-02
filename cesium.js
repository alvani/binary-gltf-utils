
const RADIANS_PER_DEGREE = Math.PI / 180.0;
const EPSILON14 = 0.00000000000001;

var wgs84RadiiSquared = {
	x: 6378137.0 * 6378137.0, 
	y: 6378137.0 * 6378137.0, 
	z: 6356752.3142451793 * 6356752.3142451793
};

var ellipsoid = {
    x: 6378137.0, 
    y: 6378137.0, 
    z: 6356752.3142451793
}; 

function toRadians(degrees) {
	return degrees * RADIANS_PER_DEGREE;
}

function toDegrees(radians) {
    return radians / RADIANS_PER_DEGREE;
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

function subtract(left, right, result) {    
    result.x = left.x - right.x;
    result.y = left.y - right.y;
    result.z = left.z - right.z;
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

var wgs84OneOverRadii = {x: 1.0 / 6378137.0, y: 1.0 / 6378137.0, z: 1.0 / 6356752.3142451793};
var wgs84OneOverRadiiSquared = {x: 1.0 / (6378137.0 * 6378137.0), y: 1.0 / (6378137.0 * 6378137.0), z: 1.0 / (6356752.3142451793 * 6356752.3142451793)};
var wgs84CenterToleranceSquared = 0.1;

function scaleToGeodeticSurface(cartesian, oneOverRadii, oneOverRadiiSquared, centerToleranceSquared) {    
    var positionX = cartesian.x;
    var positionY = cartesian.y;
    var positionZ = cartesian.z;

    var oneOverRadiiX = oneOverRadii.x;
    var oneOverRadiiY = oneOverRadii.y;
    var oneOverRadiiZ = oneOverRadii.z;

    var x2 = positionX * positionX * oneOverRadiiX * oneOverRadiiX;
    var y2 = positionY * positionY * oneOverRadiiY * oneOverRadiiY;
    var z2 = positionZ * positionZ * oneOverRadiiZ * oneOverRadiiZ;

    // Compute the squared ellipsoid norm.
    var squaredNorm = x2 + y2 + z2;
    var ratio = Math.sqrt(1.0 / squaredNorm);

    // As an initial approximation, assume that the radial intersection is the projection point.
    var intersection = {};
    multiplyByScalar(cartesian, ratio, intersection);

    // If the position is near the center, the iteration will not converge.
    if (squaredNorm < centerToleranceSquared) {
        return !isFinite(ratio) ? undefined : intersection;
    }

    var oneOverRadiiSquaredX = oneOverRadiiSquared.x;
    var oneOverRadiiSquaredY = oneOverRadiiSquared.y;
    var oneOverRadiiSquaredZ = oneOverRadiiSquared.z;

    // Use the gradient at the intersection point in place of the true unit normal.
    // The difference in magnitude will be absorbed in the multiplier.
    var gradient = {};
    gradient.x = intersection.x * oneOverRadiiSquaredX * 2.0;
    gradient.y = intersection.y * oneOverRadiiSquaredY * 2.0;
    gradient.z = intersection.z * oneOverRadiiSquaredZ * 2.0;

    // Compute the initial guess at the normal vector multiplier, lambda.
    var lambda = (1.0 - ratio) * magnitude(cartesian) / (0.5 * magnitude(gradient));
    var correction = 0.0;

    var func;
    var denominator;
    var xMultiplier;
    var yMultiplier;
    var zMultiplier;
    var xMultiplier2;
    var yMultiplier2;
    var zMultiplier2;
    var xMultiplier3;
    var yMultiplier3;
    var zMultiplier3;

    do {
        lambda -= correction;

        xMultiplier = 1.0 / (1.0 + lambda * oneOverRadiiSquaredX);
        yMultiplier = 1.0 / (1.0 + lambda * oneOverRadiiSquaredY);
        zMultiplier = 1.0 / (1.0 + lambda * oneOverRadiiSquaredZ);

        xMultiplier2 = xMultiplier * xMultiplier;
        yMultiplier2 = yMultiplier * yMultiplier;
        zMultiplier2 = zMultiplier * zMultiplier;

        xMultiplier3 = xMultiplier2 * xMultiplier;
        yMultiplier3 = yMultiplier2 * yMultiplier;
        zMultiplier3 = zMultiplier2 * zMultiplier;

        func = x2 * xMultiplier2 + y2 * yMultiplier2 + z2 * zMultiplier2 - 1.0;

        // "denominator" here refers to the use of this expression in the velocity and acceleration
        // computations in the sections to follow.
        denominator = x2 * xMultiplier3 * oneOverRadiiSquaredX + y2 * yMultiplier3 * oneOverRadiiSquaredY + z2 * zMultiplier3 * oneOverRadiiSquaredZ;

        var derivative = -2.0 * denominator;

        correction = func / derivative;
    } while (Math.abs(func) > 0.000000000001);

    return {x: positionX * xMultiplier, y: positionY * yMultiplier, z: positionZ * zMultiplier}; 
}

// returns {lon, lat, height}
exports.fromCartesian = function(cartesian) {
    var oneOverRadii = wgs84OneOverRadii;
    var oneOverRadiiSquared = wgs84OneOverRadiiSquared;
    var centerToleranceSquared = wgs84CenterToleranceSquared;

    //`cartesian is required.` is thrown from scaleToGeodeticSurface
    var p = scaleToGeodeticSurface(cartesian, oneOverRadii, oneOverRadiiSquared, centerToleranceSquared);    

    if (!p) {
        return undefined;
    }

    var n = {};
    multiplyComponents(cartesian, oneOverRadiiSquared, n);
    normalize(n, n);

    var h = {};
    subtract(cartesian, p, h);

    var longitude = Math.atan2(n.y, n.x);
    var latitude = Math.asin(n.z);
    var height = sign(dot(h, cartesian)) * magnitude(h);

    return {lon: longitude, lat: latitude, height: height};
    // return {lon: toDegrees(longitude), lat: toDegrees(latitude), height: height};        
};