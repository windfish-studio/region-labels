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

function castRay(world, start, end){
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

    if (hitPoints.length === 0)
        return false;

    if (start[0] === end[0]) { //vertical line
        var minY = _.minBy(hitPoints, function (point) {
            return point[1]
        });
        var maxY = _.maxBy(hitPoints, function (point) {
            return point[1]
        });
        return [minY, maxY];
    }
    var minX =_.minBy(hitPoints, function(point){return point[0]});
    var maxX =_.maxBy(hitPoints, function(point){return point[0]});
    return [minX, maxX];
}

function newLine(bbox, slope, yIntercept, flipped) {
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
}

function lineLoop(lines, offset, bbox, slope, yInt, flipped){
    yInt += offset;
    var line = newLine(bbox, slope, yIntercept, flipped);
    if (pip(line.start, bbox.points) || pip(line.end, bbox.points)){
        lines.push(line);
        lineLoop(lines, yInt, offset, bbox, slope, flipped);
    }
}

function regressionLines (bbox, slope, yIntercept, flipped){
    var offset = (!flipped)? bbox.height / 5 : bbox.width / 5;
    var lines = [];
    var nextLine = newLine(bbox, slope, yIntercept, flipped);
    lines.push(nextLine);
    lineLoop(lines, offset, bbox, slope, yIntercept, flipped);
    offset = - offset;
    lineLoop(lines, offset, bbox, slope, yIntercept, flipped);
    return lines;
}

function getDist(start, end){
    var distX = Math.abs(end[0] - start[0]);
    var distY = Math.abs(end[1] - start[1]);
    var dist = Math.sqrt( distX*distX + distY*distY );
    return (end[0] > start[0])? dist : -dist;
}

function getMidPoint(start, end){
    return [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2];
}

function addPerpendicularRelativeMidPoint(world, start, end, offset, center, points){
    var ray = castRay(world, start, end);
    var midPoint = getMidPoint(ray[0], ray[1]);
    var relativeMidPoint = [getDist(offset, center), getDist(midPoint, offset)];
    points.push(relativeMidPoint);
}

function untranslate (point, center, slope){

    var x1 = - point[0];
    var y1 = (slope < 0)? - point[1] : point[1];
    var angle = Math.atan(slope);

    var x2 = x1 * Math.cos(angle) - y1 * Math.sin(angle);
    var y2 = x1 * Math.sin(angle) + y1 * Math.cos(angle);

    var translated = [];

    translated.push(x2 + center[0]);
    translated.push(y2 + center[1]);

    return translated;
}

function main(shapes, ctx) {
    var regX, regY, lines, splineEquation, longestLineSlope, longestRay, rayStart, rayEnd, rayCenter, rayLength, rayFlipped, numPerpSegments, raySegment, rayHalf,
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
    bbox.points = [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY];

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

    lines = regressionLines(bbox, regX.equation[0], regX.equation[1]).concat( regressionLines(bbox, regY.equation[0], regY.equation[0], true) );

    _.each(lines, function(line){
        var ray = castRay(world, line.start, line.end);
        if (ray) validRays.push({ray: ray, flipped: line.flipped});
    });

    longestRay = _.maxBy(validRays, function(obj){
        return Math.abs(obj.ray[1][0] - obj.ray[0][0]);
    });
    rayStart = longestRay.ray[0];
    rayEnd = longestRay.ray[1];
    rayFlipped = longestRay.flipped;
    rayCenter = getMidPoint(rayStart,rayEnd);
    rayLength = getDist(rayStart, rayEnd);

    numPerpSegments = 10;
    raySegment = rayLength / numPerpSegments;
    rayHalf = rayLength / 2;

    rayOffsets.push( getMidPoint(rayStart, rayCenter));
    rayOffsets.push(rayCenter);
    rayOffsets.push( getMidPoint(rayCenter, rayEnd));

    longestLineSlope = (rayStart[1] - rayEnd[1]) / (rayStart[0] - rayEnd[0]);

    switch (longestLineSlope){
        case 0:
            _.each(rayOffsets, function(offset){
                var lineStart = [offset[0], bbox.minY];
                var lineEnd = [offset[0], bbox.maxY];
                addPerpendicularRelativeMidPoint(world, lineStart, lineEnd, offset, rayCenter, relativeMidPoints);

            });
            break;
        case -Infinity:
            _.each(rayOffsets, function(offset){
                var lineStart = [bbox.minX, offset[1]];
                var lineEnd = [bbox.maxX, offset[1]];
                addPerpendicularRelativeMidPoint(world, lineStart, lineEnd, offset, rayCenter, relativeMidPoints);
            });
            break;
        default:
            var perpSlope = -1 / longestLineSlope;

            _.each(rayOffsets, function(offset){
                var intercept = offset[1] - perpSlope * offset[0];
                var line = newLine(bbox, perpSlope, intercept, rayFlipped);
                addPerpendicularRelativeMidPoint(world, line.start, line.end, offset, rayCenter, relativeMidPoints);
            });
    }
    splineEquation = regression('polynomial', relativeMidPoints, 2).equation;
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