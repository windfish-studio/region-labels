'use strict';

var _ = require("lodash");
var p2 = require("p2");
var pip = require("point-in-polygon");
var regression = require("regression");

function computeControlPoints(K)
//function from https://www.particleincell.com/2012/bezier-splines/
{
    var p1=new Array();
    var p2=new Array();
    var n = K.length-1;

    /*rhs vector*/
    var a=new Array();
    var b=new Array();
    var c=new Array();
    var r=new Array();

    /*left most segment*/
    a[0]=0;
    b[0]=2;
    c[0]=1;
    r[0] = K[0]+2*K[1];

    /*internal segments*/
    for (var i = 1; i < n - 1; i++)
    {
        a[i]=1;
        b[i]=4;
        c[i]=1;
        r[i] = 4 * K[i] + 2 * K[i+1];
    }

    /*right segment*/
    a[n-1]=2;
    b[n-1]=7;
    c[n-1]=0;
    r[n-1] = 8*K[n-1]+K[n];

    /*solves Ax=b with the Thomas algorithm (from Wikipedia)*/
    for (i = 1; i < n; i++)
    {
        var m = a[i]/b[i-1];
        b[i] = b[i] - m * c[i - 1];
        r[i] = r[i] - m*r[i-1];
    }

    p1[n-1] = r[n-1]/b[n-1];
    for (i = n - 2; i >= 0; --i)
        p1[i] = (r[i] - c[i] * p1[i+1]) / b[i];

    /*we have p1, now compute p2*/
    for (i=0;i<n-1;i++)
        p2[i]=2*K[i+1]-p1[i+1];

    p2[n-1]=0.5*(K[n]+p1[n-1]);

    return {p1:p1, p2:p2};
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
function computeRay(world,start,end){
    var axis = (start[0] === end[0])? 1 : 0;
    var hitPoints = getHitPoints(world,start,end);
    if (hitPoints.length === 0)
        return false;
    var sortedHitPoints = _.sortBy(hitPoints, [function(point){return(point[axis])}]);
    var longestRay, rays = [], segments = [], segmentGroups = [];
    for(var i=0;i<sortedHitPoints.length;i+=2){
        var segmentStart = sortedHitPoints[i];
        var segmentEnd = sortedHitPoints[i + 1];
        segments.push([segmentStart,segmentEnd]);
    }
    if (segments.length === 1){
        return segments[0];
    }
    var addGroup = function(){
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

            if (dist > _.max([firstLength,nextLength]) / 2){
                segmentGroups.push(group);
                return;
            } else {
                addSegments();
            }
        };
        addSegments();
    };
    while (segments.length > 0){
        addGroup();
    }
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


function getMidPoint(start, end){
    return [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2];
}


function untranslate (point, center, slope){

    var x1 = (slope < 0)? -point[0] : point[0];
    var y1 = point[1];
    var angle = Math.atan(slope);

    var x2 = x1 * Math.cos(angle) - y1 * Math.sin(angle);
    var y2 = x1 * Math.sin(angle) + y1 * Math.cos(angle);

    var translated = [];

    translated.push(x2 + center[0]);
    translated.push(y2 + center[1]);

    return translated;
}

function main(shapes, ctx) {
    var regX, regY, lines, spline, splineEquation, longestLineSlope,
        longestLineIntercept, longestLinePSlope, longestLinePIntercept,
        longestRay, rayStart, rayEnd, rayCenter, rayLength,
        numPerpSegments, raySegment, rayHalf,
        rayOffsets = [],
        validRays = [],
        relativeMidPoints = [],
        untranslatedPointsX = [],
        untranslatedPointsY = [],
        splinePoints = [],
        linearDataXY = [],
        linearDataYX = [],
        pointsInsideOffset = 3,
        world = new p2.World(),
        body = new p2.Body(),
        allPoints = Array.prototype.concat.apply([],shapes);
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

    //get a list of all points (with some offset) inside all shapes used for least squares regression

    _.each(shapes, function(vertices){
        var shape = new p2.Convex({ vertices: vertices });
        body.addShape(shape);
    });
    world.addBody(body);

    _.each(_.range(bbox.minX, bbox.maxX + 1, pointsInsideOffset), function (x) {
        _.each(_.range(bbox.minY, bbox.maxY + 1, pointsInsideOffset), function(y){
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

    var newLine = function(slope, yIntercept, flipped) {
        var otherMin, otherMax, line = {};
        if (!flipped) {
            otherMin = slope * bbox.minX + yIntercept;
            otherMax = slope * bbox.maxX + yIntercept;
            line.start = [bbox.minX, otherMin];
            line.end = [bbox.maxX, otherMax];
        } else {
            otherMin = slope * bbox.minY + yIntercept;
            otherMax = slope * bbox.maxY + yIntercept;
            line.start = [otherMin, bbox.minY];
            line.end = [otherMax, bbox.maxY];
        }
        line.flipped = flipped;
        return line;
    };

    var regressionLines = function(slope, yIntercept, flipped){

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
    };
    lines = regressionLines(regX.equation[0], regX.equation[1]).concat( regressionLines(regY.equation[0], regY.equation[1], true) );

    _.each(lines, function(line){
        var ray = computeRay(world, line.start, line.end);
        if (ray) {
            validRays.push({ray: ray, flipped: line.flipped});
            //ctx.moveTo(ray[0][0], ray[0][1]);
            //ctx.lineTo(ray[1][0], ray[1][1]);
        }
    });

    longestRay = _.maxBy(validRays, function(obj){
        //return Math.abs(obj.ray[1][0] - obj.ray[0][0]);
        return getDist(obj.ray[0], obj.ray[1]);
    });
    rayStart = longestRay.ray[0];
    rayEnd = longestRay.ray[1];
    rayCenter = getMidPoint(rayStart,rayEnd);
    rayLength = getDist(rayStart, rayEnd);

    ctx.moveTo(rayStart[0], rayStart[1]);
    ctx.lineTo(rayEnd[0], rayEnd[1]);

    numPerpSegments = 10;
    raySegment = rayLength / numPerpSegments;
    rayHalf = rayLength / 2;

    rayOffsets.push( getMidPoint(rayStart, rayCenter));
    rayOffsets.push(rayCenter);
    rayOffsets.push( getMidPoint(rayCenter, rayEnd));

    longestLineSlope = getSlope(rayStart, rayEnd);
    longestLineIntercept = rayCenter[1] - longestLineSlope * rayCenter[0];

    longestLinePSlope = -1 / longestLineSlope;
    longestLinePIntercept = rayCenter[1] - (-1/longestLineSlope) * rayCenter[0];

    var addPerpendicularRelativeMidPoint = function(start, end, offset){
        var ray = computeRay(world, start, end);
        if (!ray) return false;
        var midPoint = getMidPoint(ray[0], ray[1]);

        ctx.strokeRect(midPoint[0], midPoint[1], 3, 3); //draw midpoint

        var relativeX = getDist(offset, rayCenter);
        var relativeY = getDist(midPoint, offset);

        var doInvert = function(slope, intercept, start, end, axis){
            return (slope == -Infinity && end[axis] - start[axis] < 0) || //special case for Infinity slope
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
    };
    var findMidPoint = function(slope, offset){
        function tryMidPoint(offset){
            function tryOffset(offset){
                var intercept = offset[1] - slope * offset[0];
                var line = newLine(slope, intercept);
                return addPerpendicularRelativeMidPoint(line.start, line.end, offset);
            }
            var validPoint = tryOffset(offset);
            validPoint = validPoint || tryOffset(-offset);
            return validPoint;
        }
        for (var i=0;i<rayLength;i++){
            var point = tryMidPoint([offset[0]+i, offset[1]]);
            if (point) return point;
        }
        return false;
    };

    _.each(rayOffsets, function(offset) {

        switch (longestLineSlope) {
            case 0:
                var lineStart = [offset[0], bbox.minY];
                var lineEnd = [offset[0], bbox.maxY];
                addPerpendicularRelativeMidPoint(lineStart, lineEnd, offset);
                break;
            case -Infinity:
                var lineStart = [bbox.minX, offset[1]];
                var lineEnd = [bbox.maxX, offset[1]];
                addPerpendicularRelativeMidPoint(lineStart, lineEnd, offset);
                break;
            default:
                var perpSlope = -1 / longestLineSlope;
                findMidPoint(perpSlope, offset);
        }
    });
    spline = regression('polynomial', relativeMidPoints, 2);
    splineEquation = spline.equation;
    for(var i=0;i<=numPerpSegments;i++){
        var x = - rayHalf + i * raySegment;
        var y = splineEquation[2] * Math.pow(x,2) + splineEquation[1] * x + splineEquation[0];
        var p = untranslate([x,y], rayCenter, longestLineSlope);
        _.each(shapes, function(shape){
            if (pip(p, shape)){
                splinePoints.push(p);
                return false;
            }
        });
    }

    ctx.strokeStyle = '#0000ff';
    _.each(splinePoints, function(p){

        untranslatedPointsX.push(p[0]);
        untranslatedPointsY.push(p[1]);
        ctx.strokeRect(p[0],p[1],1,1);
    });
    ctx.strokeStyle = '#555555';
    var ctrlX = computeControlPoints(untranslatedPointsX);
    var ctrlY = computeControlPoints(untranslatedPointsY);
    ctx.moveTo(untranslatedPointsX[0], untranslatedPointsY[0]);
    for(var i=0;i<ctrlX.p1.length;i++){
        ctx.bezierCurveTo(ctrlX.p1[i],ctrlY.p1[i],ctrlX.p2[i],ctrlY.p2[i],untranslatedPointsX[i+1], untranslatedPointsY[i+1]);
    }
    ctx.stroke();

}

if(typeof window != 'undefined')
  window.RegionLabel = main;

module.exports = main;