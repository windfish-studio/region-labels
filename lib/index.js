'use strict';

var _ = require("lodash");
var p2 = require("p2");
var pip = require("point-in-polygon");
var regression = require("regression");
var arcSolver = require("./parabolic_arclength_solver");

function calcPolygonArea(vertices) {
    //https://stackoverflow.com/questions/16285134/calculating-polygon-area
    var total = 0;
    for (var i = 0, l = vertices.length; i < l; i++) {
        var addX = vertices[i][0];
        var addY = vertices[i === vertices.length - 1 ? 0 : i + 1][1];
        var subX = vertices[i === vertices.length - 1 ? 0 : i + 1][0];
        var subY = vertices[i][1];

        total += (addX * addY * 0.5);
        total -= (subX * subY * 0.5);
    }
    return Math.abs(total);
}
function getHitPoints(world, start, end){
    var hitPoints = [];
    var ray = new p2.Ray({
        mode: p2.Ray.ALL,
        from: start,
        to: end,
        callback: function (result) {
            var hitPoint = p2.vec2.create();
            result.getHitPoint(hitPoint, ray);
            if (result.hasHit()) {
                hitPoints.push([hitPoint[0], hitPoint[1]]);
            }
        }
    });
    var result = new p2.RaycastResult();
    world.raycast(result, ray);
    return hitPoints;
}

function rayFromHitPoints(hitPoints){
    if (hitPoints.length < 2)
        return false;
    var axis = (hitPoints[0][0] === hitPoints[1][0])? 1 : 0;
    var min =_.minBy(hitPoints, function(point){return point[axis]});
    var max =_.maxBy(hitPoints, function(point){return point[axis]});
    return [min, max];
}
function groupSegments (segments, area){
    var rays = [], segmentGroups = [], altered = false;
    var first, next, firstLength, nextLength, dist, group = [];
    var addSegments = function(){
        first = segments.shift();
        group.push(first);
        if (segments.length === 0) {
            segmentGroups.push(group);
            return;
        }
        next = segments[0];
        firstLength = getDist(first[0],first[1]);
        nextLength = getDist(next[0],next[1]);
        dist = getDist(first[1],next[0]);

        if (dist > _.max([firstLength,nextLength]) * (1/area)){
            segmentGroups.push(group);
            group = [];
            addSegments();
        } else {
            altered = true;
            addSegments();
        }
    };
    addSegments();

    _.each(segmentGroups, function(group){
        var points = [];
        _.each(group, function(seg){
            points.push(seg[0],seg[1]);
        });
        var ray = rayFromHitPoints(points);
        if (ray) {
            rays.push(ray);
        }
    });
    if (!altered) return rays;
    else return groupSegments(rays, area);
}

function computeRay(world,start,end, area){

    var axis = (start[0] === end[0])? 1 : 0;
    var hitPoints = getHitPoints(world,start,end);
    if (hitPoints.length === 0)
        return false;
    var sortedHitPoints = _.sortBy(hitPoints, [function(point){return(point[axis])}]);
    var rays, longestRay, segments = [];
    for(var i=0;i<sortedHitPoints.length;i+=2){
        var segmentStart = sortedHitPoints[i];
        var segmentEnd = sortedHitPoints[i + 1];
        segments.push([segmentStart,segmentEnd]);
    }
    if (segments.length === 1){
        return segments[0];
    }
    rays = groupSegments(segments, area);

    longestRay = _.maxBy(rays, function(p){
        return getDist(p[0],p[1]);
    });
    return longestRay;
}

function getDist(start, end){
    var distX = end[0] - start[0];
    var distY = end[1] - start[1];
    return Math.sqrt( distX*distX + distY*distY );
}

function getSlope(start, end){
    return (end[1] - start[1]) / (end[0] - start[0])
}

function getPerpendicularSlope(slope){
    var perpSlope;
    switch (slope) {
        case 0:
            perpSlope = -Infinity;
            break;
        case -Infinity:
            perpSlope = 0;
            break;
        default:
            perpSlope = -1 / slope;
    }
    return perpSlope
}

function getMidPoint(start, end){
    return [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2];
}

function spawnCanvas(dims) {
    var canvas;
    if(typeof document == 'undefined'){
        var pkgName = 'canvas';
        var Canvas = require(pkgName); //so that this won't be parsed by browserify
        canvas = new Canvas(dims[0], dims[1]);
    }else{
        var canvas = document.createElement('canvas');
        canvas.width = dims[0];
        canvas.height = dims[1];
    }

    return canvas;
};

function RegionLabel(shapes, text) {

    var regX, regY, lines, spline, relativeSplineEquation, landArea, numPerpSegments, fontSize, reverseLetters, textWidth, firstPoint, lastPoint,
        letterPoints, distFromLast, labelStartX, labelStartY, raySegment, rayHalf, rayStart, rayEnd, rayCenter, rayLength,
        longestLineSlope,longestLineAngle, longestLineIntercept, longestLinePSlope, longestLinePIntercept, longestRay,
        rayOffsets = [], validRays = [], relativeMidPoints = [], linearDataXY = [], linearDataYX = [], letterData = [],
        shapesArea = 0,
        world = new p2.World(), body = new p2.Body(),
        allPoints = Array.prototype.concat.apply([],shapes),
        scope = this;

    var letters = text.split("");
    var canvas = spawnCanvas([1,1]); //only for access to measureText...
    var ctx = canvas.getContext('2d');
    var bbox = RegionLabel.generateBoundingBox(allPoints);

    //absolute points to relative
    function translate(point, center, slope){
        var angle = -Math.atan(slope);

        var translated = [];

        translated.push(point[0] - center[0]);
        translated.push(point[1] - center[1]);

        var rotated = rotateAroundPoint(translated, angle);
        rotated[0] = (slope < 0)? -rotated[0] : rotated[0];

        return rotated;
    };

    //relative points to absolute
    function untranslate(point, center, slope){

        var x1 = (slope < 0)? -point[0] : point[0];
        var y1 = point[1];
        var angle = Math.atan(slope);

        var rotated = rotateAroundPoint([x1, y1], angle);
        var translated = [];

        translated.push(rotated[0] + center[0]);
        translated.push(rotated[1] + center[1]);

        return translated;
    };

    function rotateAroundPoint(point, angle) {
        var x1 = point[0], y1 = point[1];

        var x2 = x1 * Math.cos(angle) - y1 * Math.sin(angle);
        var y2 = x1 * Math.sin(angle) + y1 * Math.cos(angle);

        return [x2, y2];
    }

    function newLine (slope, yIntercept, flipped) {
        var otherMin, otherMax, lineStart, lineEnd;
        if (slope === -Infinity){
            lineStart = [yIntercept, bbox.minY];
            lineEnd = [yIntercept, bbox.maxY];
        } else {
            if (!flipped) {
                otherMin = slope * bbox.minX + yIntercept;
                otherMax = slope * bbox.maxX + yIntercept;
                lineStart = [bbox.minX, otherMin];
                lineEnd = [bbox.maxX, otherMax];
            } else {
                otherMin = slope * bbox.minY + yIntercept;
                otherMax = slope * bbox.maxY + yIntercept;
                lineStart = [otherMin, bbox.minY];
                lineEnd = [otherMax, bbox.maxY];
            }
        }
        return {start: lineStart, end: lineEnd}
    }

    function regressionLines (slope, yIntercept, flipped){
        var linesPerAxis = 10;
        var offset = (!flipped)? bbox.height / linesPerAxis : bbox.width / linesPerAxis;
        var lines = [];

        function lineLoop(offset, yInt){
            yInt += offset;
            var line = newLine(slope, yInt, flipped);
            if (pip(line.start, bbox.points) || pip(line.end, bbox.points)){
                lines.push(line);
                lineLoop(offset, yInt);
            }
        }
        lines.push( newLine(slope, yIntercept, flipped) );
        lineLoop(offset, yIntercept);
        lineLoop(-offset, yIntercept);
        return lines;
    }
    function addPerpendicularRelativeMidPoint(start, end, offset){
        var ray = computeRay(world, start, end, landArea);
        if (!ray) return false;
        var midPoint = getMidPoint(ray[0], ray[1]);

        var relativeX = getDist(offset, rayCenter);
        var relativeY = getDist(midPoint, offset);

        var doInvert = function(slope, intercept, start, end, axis){
            return (slope === -Infinity && end[axis] - start[axis] < 0) || //special case for Infinity slope
                (midPoint[1] < ((slope * midPoint[0]) + intercept)); //linear inequality y < mx + b, plugging in midpoint
        };

        if(doInvert(longestLinePSlope, longestLinePIntercept, offset, rayCenter,0)){
            relativeX = relativeX * -1; //assign directionality
        }

        if( doInvert(longestLineSlope, longestLineIntercept, midPoint, offset,1) ){
            relativeY = relativeY * -1;
        }

        var relativeMidPoint = [ relativeX, relativeY ];
        relativeMidPoints.push(relativeMidPoint);
        return relativeMidPoint;
    }
    function findMidPoint (slope, offset){
        var axis = (slope === 0)? 1 : 0;
        function tryMidPoint(offset){
            function tryOffset(offset){
                var line, intercept;
                if (slope === -Infinity)
                    intercept = offset[0];
                else
                    intercept = offset[1] - slope * offset[0];
                line = newLine(slope, intercept);
                return addPerpendicularRelativeMidPoint(line.start, line.end, offset);
            }
            var validPoint = tryOffset(offset);
            validPoint = validPoint || tryOffset(-offset);
            return validPoint;
        }
        for (var i=0;i<rayLength;i++){
            offset[axis] += 1;
            var point = tryMidPoint(offset);
            if (point) return point;
        }
        return false;
    }
    function getTextWidth(font){
        ctx.font = font + 'px sans-serif';
        return ctx.measureText(text).width;
    }
    function placeLetters (start){

        var lettersWithPoints = [];
        var letterPadding = ctx.measureText(" ").width / 4;
        var nextPoint = start;

        _.each(letters, function(letter) {

            lettersWithPoints.push({letter: letter, point: nextPoint});
            var letterWidth = ctx.measureText(letter).width + letterPadding;
            var letterDistance = (reverseLetters)? - letterWidth : letterWidth;
            var nextPointX = arcSolver(relativeSplineEquation[2], relativeSplineEquation[1], nextPoint[0], letterDistance);
            var nextPointY = relativeSplineEquation[2] * Math.pow(nextPointX, 2) + relativeSplineEquation[1] * nextPointX + relativeSplineEquation[0];
            nextPoint = [nextPointX, nextPointY];
        });
        return lettersWithPoints;
    }

    function getExtremePoint(direction){
        var delta = (direction == 'first')? 1 : -1;
        var rayHalf = rayLength / 2;
        var segments = 50;
        var segLength = (rayLength / segments);

        var getPoint = function(index){
            var x = -rayHalf + index * segLength;
            var y = relativeSplineEquation[2] * Math.pow(x, 2) + relativeSplineEquation[1] * x + relativeSplineEquation[0];
            var p = untranslate([x, y], rayCenter, longestLineSlope);
            return {absolute: p, relative: [x, y]}
        };

        var point;
        var lastPoint;
        var i = (delta > 0)? 0 : segments;

        while(!point || !lastPoint){
            var p = getPoint(i);
            var match = false;

            _.each(shapes, function (shape) {
                if (pip(p.absolute, shape)) {
                    point = p;
                    match = true;
                    return false;
                }
            });

            if(!match){
                lastPoint = p;
                i += delta;
            }else{
                i -= delta;
            }
        }

        var p = getHitPoints(world, lastPoint.absolute, point.absolute)[0];
        var t = translate(p, rayCenter, longestLineSlope);

        return { absolute: p, relative:  t};

    };

    this.getSplineData = function(){

        return {
            spline: spline,
            firstPoint: firstPoint,
            lastPoint: lastPoint,
            longestRay: {
                ray: longestRay,
                start: rayStart,
                end: rayEnd,
                center: rayCenter,
                length: rayLength,
                slope: longestLineSlope,
                angle: longestLineAngle,
                intercept: longestLineIntercept,
                pslope: longestLinePSlope,
                pintercept: longestLinePIntercept
            }
        };
    };

    this.getLabelData = function(){
        return {letters: letterData, fontSize: fontSize};
    };

    this.debugDraw = function (dims) {

        var canvas = spawnCanvas(dims);

        var ctx = canvas.getContext('2d');

        var _s = this.getSplineData();

        var numPerpSegments = 20;
        var l = _s.lastPoint.relative[0] - _s.firstPoint.relative[0];
        var raySegment = -l / numPerpSegments;

        var splineEquation = _s.spline.equation;

        ctx.strokeStyle = "#0F0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(var i = 0; i <= numPerpSegments; i++){
            var x = _s.lastPoint.relative[0] + i * raySegment;
            var y = splineEquation[2] * Math.pow(x,2) + splineEquation[1] * x + splineEquation[0];
            var p = untranslate([x,y], _s.longestRay.center, _s.longestRay.slope);
            if(i == 0){
                ctx.moveTo(p[0], p[1]);
            }else{
                ctx.lineTo(p[0], p[1]);
            }
        }
        ctx.stroke();

        ctx.strokeStyle = "#0FF";
        ctx.beginPath();
        var p = _s.longestRay.start;
        ctx.moveTo(p[0], p[1]);
        p = _s.longestRay.end;
        ctx.lineTo(p[0], p[1]);
        ctx.stroke();


        //draw spline entry/exit points
        _.each(['firstPoint', 'lastPoint'], function (_k) {
            var p = _s[_k].absolute;
            ctx.beginPath();
            ctx.arc(p[0], p[1], 5, 2 * Math.PI, 0);
            ctx.closePath();

            ctx.fillStyle = (_k == 'firstPoint') ? '#F00' : '#00F';

            ctx.fill();
        });

        return canvas;

    };

    //returns a canvas with dimensions specified in dims, with only the finished label drawn.
    //makes it so that this library can easily be used on the server-side to pre-generate loads of labels
    //for future use...
    this.drawLabel = function(dims){
        var canvas = spawnCanvas(dims);

        var ctx = canvas.getContext('2d');
        var labelData = this.getLabelData();

        ctx.font = labelData.fontSize + 'px sans-serif';

        _.each(labelData.letters, function(obj) {
            ctx.save();
            ctx.translate(obj.point[0], obj.point[1]);
            ctx.rotate(obj.angle);
            ctx.fillStyle = "#000";
            ctx.fillText(obj.letter, 0, 0);
            ctx.restore();
        });

        return canvas;
    };

    _.each(shapes, function(vertices){
        var shape = new p2.Convex({ vertices: vertices });
        shapesArea += calcPolygonArea(vertices);
        body.addShape(shape);
    });
    landArea = shapesArea / calcPolygonArea(bbox.points);
    world.addBody(body);

    //get a list of all points (with some offset) inside all shapes used for least squares regression
    var bboxDivisions = 50;

    _.each(_.range(bbox.minX, bbox.maxX + 1, (bbox.width + 1) / bboxDivisions), function (x) {
        _.each(_.range(bbox.minY, bbox.maxY + 1, (bbox.height + 1) / bboxDivisions), function(y){
            var p = [x,y];
            _.each(shapes, function(shape){
                if (pip(p, shape)){
                    linearDataXY.push(p);
                    return false;
                }
            })
        })
    });
    _.each(linearDataXY, function(p){
        linearDataYX.push([p[1], p[0]]);
    });

    regX = regression('linear', linearDataXY);
    regY = regression('linear', linearDataYX);
    lines = regressionLines(regX.equation[0], regX.equation[1]).concat( regressionLines(regY.equation[0], regY.equation[1], true) );

    _.each(lines, function(line){
        var ray = computeRay(world, line.start, line.end, landArea);
        if (ray) validRays.push(ray);
    });

    longestRay = _.maxBy(validRays, function(ray){
        return getDist(ray[0], ray[1]);
    });

    rayStart = longestRay[0];
    rayEnd = longestRay[1];
    rayCenter = getMidPoint(rayStart,rayEnd);
    rayLength = getDist(rayStart, rayEnd);

    rayOffsets.push( getMidPoint(rayStart, rayCenter));
    rayOffsets.push(rayCenter);
    rayOffsets.push( getMidPoint(rayCenter, rayEnd));

    longestLineSlope = getSlope(rayStart, rayEnd);
    longestLineAngle = Math.atan(longestLineSlope);
    longestLineIntercept = rayCenter[1] - longestLineSlope * rayCenter[0];
    longestLinePSlope = -1 / longestLineSlope;
    longestLinePIntercept = rayCenter[1] - (-1/longestLineSlope) * rayCenter[0];

    _.each(rayOffsets, function(offset) {
        var perpSlope = getPerpendicularSlope(longestLineSlope);
        findMidPoint(perpSlope, offset);
    });

    spline = regression('polynomial', relativeMidPoints, 2);
    relativeSplineEquation = spline.equation;

    firstPoint = getExtremePoint('first');
    lastPoint = getExtremePoint('last');

    if (longestLineSlope < 0){
        reverseLetters = true;
        lastPoint = [firstPoint, firstPoint = lastPoint][0]; //swap first and last point
    }
    fontSize = Math.sqrt(shapesArea);
    textWidth = getTextWidth(fontSize);

    while (textWidth > rayLength * 0.75){ //decrease font size if needed
        fontSize *= 0.75;
        textWidth = getTextWidth(fontSize);
    }

    letterPoints = placeLetters(firstPoint.relative);
    distFromLast = getDist(letterPoints[letterPoints.length -1].point, lastPoint.relative);
    distFromLast -= ctx.measureText(text[text.length - 1]).width;
    if (longestLineSlope < 0) distFromLast *= -1;

    labelStartX = arcSolver(relativeSplineEquation[2], relativeSplineEquation[1], firstPoint.relative[0], distFromLast/2);
    labelStartY = relativeSplineEquation[2] * Math.pow(labelStartX, 2) + relativeSplineEquation[1] * labelStartX + relativeSplineEquation[0];

    letterPoints = placeLetters([labelStartX,labelStartY]);

    _.each(letterPoints, function(obj) {
        var point = obj.point;
        if (!point) return;
        var halfLetter = ctx.measureText(obj.letter).width / 2;
        var middlePoint = (longestLineSlope > 0)? point[0] + halfLetter : point[0] - halfLetter;
        var slope = 2 * relativeSplineEquation[2] * middlePoint + relativeSplineEquation[1];
        var angle = Math.atan(slope);
        if (longestLineSlope < 0)
            angle *= -1;
        angle += longestLineAngle;
        var perpSlope = getPerpendicularSlope(slope);
        var perpAngle = Math.atan(perpSlope);
        var dist = fontSize / 4;
        if (perpSlope < 0) dist *= -1;
        var x = point[0] + dist * Math.cos(perpAngle);
        var y = point[1] + dist * Math.sin(perpAngle);
        var absolutePoint = untranslate([x,y], rayCenter, longestLineSlope);

        letterData.push({letter: obj.letter, angle: angle, point: absolutePoint});
    });

}

RegionLabel.generateBoundingBox = function (allPoints) {
    var bbox = {
        minX: _.minBy(allPoints, function (vtx) {
            return vtx[0]
        })[0],
        minY: _.minBy(allPoints, function (vtx) {
            return vtx[1]
        })[1],
        maxX: _.maxBy(allPoints, function (vtx) {
            return vtx[0]
        })[0],
        maxY: _.maxBy(allPoints, function (vtx) {
            return vtx[1]
        })[1]
    };
    bbox.width = bbox.maxX - bbox.minX;
    bbox.height = bbox.maxY - bbox.minY;
    bbox.points = [[bbox.minX, bbox.minY], [bbox.minX, bbox.maxY], [bbox.maxX, bbox.maxY], [bbox.maxX, bbox.minY]];

    return bbox;
};

if(typeof window != 'undefined')
  window.RegionLabel = RegionLabel;

module.exports = RegionLabel;
