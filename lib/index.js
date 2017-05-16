'use strict';

var _ = require("lodash");
var p2 = require("p2");
var pip = require("point-in-polygon");
var regression = require("regression");

function points(shapes, ctx) {
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
    _.each(linearDataXY, function(p){ linearDataYX.push([p[1], p[0]]); });

    var regX = regression('linear', linearDataXY);
    var regY = regression('linear', linearDataYX);

    var generateLines = function(eq, flipped){
        var equation = eq;
        var newLine, offset, interceptIdx, interceptMin, interceptMax;

        function coordFunc(c){
            return equation[0] * c + equation[1];
        }
        function setVars(lineFunc, dim, idx, min, max){
            newLine = lineFunc;
            offset = bbox[dim] / 5;
            interceptIdx = idx;
            interceptMin = min;
            interceptMax = max;
        }
        function addLine(line){
            //check if either start or end point is within the borders of the bounding box
            if (_.inRange(line[0][interceptIdx], bbox[interceptMin], bbox[interceptMax]) || _.inRange(line[1][interceptIdx], bbox[interceptMin], bbox[interceptMax])){
                lines.push(line);
                lineLoop();
            }
        }
        function lineLoop(){
            equation = [equation[0], equation[1] + offset];
            var line = newLine();
            addLine(line);
        }
        if (!flipped)
            setVars(function(){return [[bbox.minX, coordFunc(bbox.minX)], [bbox.maxX, coordFunc(bbox.maxX)]]},'height', 1, 'minY', 'maxY');
        else
            setVars(function(){return [[coordFunc(bbox.minY), bbox.minY], [coordFunc(bbox.maxY), bbox.maxY]]},'width', 0, 'minX', 'maxX');

        lines.push(newLine());
        lineLoop();
        offset = - offset;
        equation = eq;
        lineLoop();

    };
    generateLines(regX.equation);
    generateLines(regY.equation, true);

    var world = new p2.World();
    var body = new p2.Body();

    _.each(shapes, function(vertices){
        var shape = new p2.Convex({ vertices: vertices });
        body.addShape(shape);
    });
    world.addBody(body);

    var fittingLines = [];

    _.each(lines, function(line){

        // ctx.beginPath();
        // ctx.moveTo(line[0][0], line[0][1]);
        // ctx.lineTo(line[1][0], line[1][1]);
        // ctx.stroke();

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
        if (hitPoints.length > 0)
            fittingLines.push(hitPoints);
    });
    var extremePoints = [];

    _.each(fittingLines, function(hitPoints){
        var minX =_.minBy(hitPoints, function(point){return point[0]});
        var maxX =_.maxBy(hitPoints, function(point){return point[0]});
        extremePoints.push([minX, maxX]);
    });
    var longest = _.maxBy(extremePoints, function(line){
        return Math.abs(line[1][0] - line[0][0]);
        // var distY = Math.abs(line[1][1] - line[0][1]);
        // var dist = Math.sqrt( distX*distX + distY*distY );
    });

    ctx.strokeStyle = '#ff0000';
    ctx.beginPath();
    ctx.moveTo(longest[0][0], longest[0][1]);
    ctx.lineTo(longest[1][0], longest[1][1]);
    ctx.stroke();

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