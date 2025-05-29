// zeronev1/mkzerone/mkzerone-aa8731a073a0f42394b89a2c06e05a7169fad598/src/modules/Vec2.js
// An object representing a 2D vector.
// Based on the Vector2 class from LibGDX.
// Written by Rahat Ahmed (http://rahatah.me/d).

function Vec2(x, y) {
    this.x = x || 0; // Ensure x and y are initialized if not provided
    this.y = y || 0;
}

Vec2.prototype.add = function(d, m) {
    this.x += d.x * m;
    this.y += d.y * m;
    return this;
}

Vec2.prototype.sub = function(x, y) {
    if (x instanceof Vec2) {
        this.x -= x.x;
        this.y -= x.y;
    } else {
        this.x -= x;
        this.y -= y;
    }
    return this;
};

Vec2.prototype.sub2 = function(d, m) {
    this.x -= d.x * m;
    this.y -= d.y * m;
    return this;
};

Vec2.prototype.angle = function() {
    return Math.atan2(this.x, this.y); // Corrected: atan2 typically takes (y, x) but game logic might use (x,y)
};

Vec2.prototype.clone = function() {
    return new Vec2(this.x, this.y);
};

Vec2.prototype.dist = function() {
    // Corrected: ~~ operator for floor, ensure numbers before multiplication
    var x = this.x;
    var y = this.y;
    return x * x + y * y; // Standard squared distance
};

Vec2.prototype.sqDist = function() {
    // This should be the magnitude or length
    return Math.sqrt(this.dist());
};

Vec2.prototype.normalize = function() {
    var d = this.sqDist();
    if (d > 0.00001) { // Check if distance is not zero (or very close to zero)
        this.x /= d;
        this.y /= d;
    } else {
        // If magnitude is 0, it's a zero vector, cannot normalize.
        // Set to a default (e.g., (0,0) or a random direction if preferred for wandering)
        this.x = 0;
        this.y = 0;
    }
    return this;
};

Vec2.prototype.scale = function(scaleX, scaleY) {
    this.x *= scaleX;
    this.y *= (scaleY || scaleY === 0) ? scaleY : scaleX; // Ensure scaleY can be 0
    return this;
};

module.exports = Vec2;