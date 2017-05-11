'use strict';

var _ = require("lodash");
var pip = require("point-in-polygon");
var regression = require("regression");

function points(points) {
    var allPoints = Array.prototype.concat.apply([],points);
    var data = [];
    var minX = _.minBy(allPoints, function (vtx) {
        return vtx[0]
    })[0];
    var minY = _.minBy(allPoints, function (vtx) {
        return vtx[1]
    })[1];
    var maxX = _.maxBy(allPoints, function (vtx) {
        return vtx[0]
    })[0];
    var maxY = _.maxBy(allPoints, function (vtx) {
        return vtx[1]
    })[1];
    var step = 3;

    _.each(_.range(minX, maxX + 1, step), function (x) {
        _.each(_.range(minY, maxY + 1, step), function(y){
          var p = [x,y];
          _.each(points, function(shape){
              if (pip(p, shape)){
                  data.push(p);
                  return false;
              }
          })
        })
    });
    var result = regression('linear', data);
    var swappedData = [];
    _.each(data, function(p){
        swappedData.push([p[1], p[0]]);

    });
    var swappedResult = regression('linear', swappedData);

    return [result, swappedResult];
}

if(typeof window != 'undefined')
  window.RegionLabel = points;

module.exports = points;