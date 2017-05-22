'use strict';

var _ = require("lodash");
var p2 = require("p2");
var pip = require("point-in-polygon");
var regression = require("regression");

function points(shapes, ctx) {
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
        for (i = 1; i < n - 1; i++)
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

    //find the bounding box for all the shapes
    var allPoints = Array.prototype.concat.apply([],shapes);
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

    //get a list of all points (with some offset) inside all shapes used for least squares regression
    var linearDataXY = [],
        linearDataYX = [],
        lines = [],
        step = 3;

    var world = new p2.World();
    var body = new p2.Body();

    _.each(shapes, function(vertices){
        var shape = new p2.Convex({ vertices: vertices });
        body.addShape(shape);
    });
    world.addBody(body);

    function castRay(line){
        var hitPoints = [];
        var ray = new p2.Ray({
            mode: p2.Ray.ALL,
            from: line[0],
            to: line[1],
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

        var minX =_.minBy(hitPoints, function(point){return point[0]});
        var maxX =_.maxBy(hitPoints, function(point){return point[0]});
        return [minX, maxX];
    }

    _.each(_.range(bbox.minX, bbox.maxX + 1, step), function (x) {
        _.each(_.range(bbox.minY, bbox.maxY + 1, step), function(y){
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

    var regX = regression('linear', linearDataXY);
    var regY = regression('linear', linearDataYX);

    var newLine = function(slope, yIntercept, flipped){
        var otherMin, otherMax, line;
        if (!flipped){
            otherMin = slope * bbox.minX + yIntercept;
            otherMax = slope * bbox.maxX + yIntercept;
            line = [[bbox.minX, otherMin], [bbox.maxX, otherMax]]
        } else {
            otherMin = slope * bbox.minY + yIntercept;
            otherMax = slope * bbox.maxY + yIntercept;
            line = [[otherMin, bbox.minY], [otherMax, bbox.maxY]];
        }
        return line
    };
    var isValidLine = function(line, flipped){
        var idx, min, max;
        if (!flipped){
            idx = 1; min = 'minY'; max = 'maxY';
        } else {
            idx = 0; min = 'minX'; max = 'maxX';
        }
        return _.inRange(line[0][idx], bbox[min], bbox[max]) || _.inRange(line[1][idx], bbox[min], bbox[max])
    };

    var regressionLines = function(m, b, flipped){
        var slope = m,
            yIntercept = b,
            offset = (!flipped)? bbox.height / 5 : bbox.width / 5;

        function lineLoop(){
            yIntercept += offset;
            var line = newLine(slope, yIntercept, flipped);
            if (isValidLine(line, flipped)){
                lines.push(line);
                lineLoop();
            }
        }
        var nextLine = newLine(slope, yIntercept, flipped);
        lines.push(nextLine);
        lineLoop();
        offset = - offset;
        yIntercept = b;
        lineLoop();
    };

    regressionLines(regX.equation[0], regX.equation[1]);
    regressionLines(regY.equation[0], regY.equation[0], true);

    var validRays = [];

    _.each(lines, function(line){

        var ray = castRay(line);
        if (ray)
            validRays.push(ray);
    });
    var offsetPoints = [];

    var longestRay = _.maxBy(validRays, function(ray){
        return Math.abs(ray[1][0] - ray[0][0]);
        // var distY = Math.abs(line[1][1] - line[0][1]);
        // var dist = Math.sqrt( distX*distX + distY*distY );
    });
    var rayStart = longestRay[0],
        rayEnd = longestRay[1];

    var segmentVec = [(rayEnd[0] - rayStart[0])/ 4, (rayEnd[1] - rayStart[1]) / 4];
    for (var i=1;i<4;i++){
        var point = [rayStart[0] + i * segmentVec[0], rayStart[1] + i * segmentVec[1]];
        offsetPoints.push(point);
    }
    var perpLines = [];
    var slope = (rayStart[1] - rayEnd[1]) / (rayStart[0] - rayEnd[0]);
    switch (slope){
        case 0:
            _.each(offsetPoints, function(p){
                var lineStart = [p[0], bbox.minY];
                var lineEnd = [p[0], bbox.maxY];
                perpLines.push([lineStart, lineEnd]);
            });
            break;
        case -Infinity:
            _.each(offsetPoints, function(p){
                var lineStart = [bbox.minX, p[1]];
                var lineEnd = [bbox.maxX, p[1]];
                perpLines.push([lineStart, lineEnd]);
            });
            break;
        default:
            var perpSlope = -1 / slope;

            _.each(offsetPoints, function(p){
                var intercept = p[1] - perpSlope * p[0];
                var line = newLine(perpSlope, intercept);
                if(!isValidLine(line, true))
                    line = newLine(perpSlope, intercept, true);
                perpLines.push(line);
            });

    }

    var midPoints = [];
    var midPointsX = [];
    var midPointsY = [];

    _.each(perpLines, function(line){
        var ray = castRay(line);
        var point = [(ray[0][0]+ray[1][0])/2, (ray[0][1]+ray[1][1])/2];
        midPoints.push(point);
        midPointsX.push(point[0]);
        midPointsY.push(point[1]);

    });
    var controlPointsX = computeControlPoints(midPointsX);
    var controlPointsY = computeControlPoints(midPointsY);

    ctx.strokeStyle = '#00ff00';
    ctx.moveTo(midPointsX[0], midPointsY[0]);
    for(var i=0;i<controlPointsX.p1.length;i++){
        ctx.bezierCurveTo(controlPointsX.p1[i],controlPointsY.p1[i],controlPointsX.p2[i],controlPointsY.p2[i],midPointsX[i+1], midPointsY[i+1]);
    }
    ctx.stroke();




    ctx.strokeStyle = '#000000';
    _.each(perpLines, function(line){
        ctx.beginPath();
        ctx.moveTo(line[0][0], line[0][1]);
        ctx.lineTo(line[1][0], line[1][1]);
        ctx.stroke();
    });

    ctx.strokeStyle = '#ff0000';
    ctx.beginPath();
    ctx.moveTo(longestRay[0][0], longestRay[0][1]);
    ctx.lineTo(longestRay[1][0], longestRay[1][1]);
    ctx.stroke();

    ctx.strokeStyle = '#000000';
    _.each(offsetPoints, function(point){
        ctx.strokeRect(point[0],point[1], 1,1);
    });
    _.each(midPoints, function(point){
        ctx.strokeRect(point[0],point[1], 1,1);
    });
    // move to the first point


    // ctx.strokeStyle = '#000000';
    // _.each(lines, function(line){
    //
    //     ctx.beginPath();
    //     ctx.moveTo(line[0][0], line[0][1]);
    //     ctx.lineTo(line[1][0], line[1][1]);
    //     ctx.stroke();
    // });

}

if(typeof window != 'undefined')
  window.RegionLabel = points;

module.exports = points;