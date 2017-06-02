'use strict';

var _ = require("lodash");

var xhr = new XMLHttpRequest();
xhr.open('GET', 'data/geo.json');
xhr.send(null);

xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
        if (xhr.status === 200) {
            var states = JSON.parse(xhr.responseText);

            var canvas = document.getElementById('c');
            canvas.width = document.body.clientWidth;
            canvas.height = document.body.clientHeight;

            if (canvas.getContext) {
                var ctx = canvas.getContext('2d');
                var stateNames = Object.keys(states);
                var stateName = stateNames[_.random(0, stateNames.length - 1)];
                var stateData = states[stateName];
                //var stateData = [[[0,0], [0,8],[2,8],[2,7],[5, 7],[5,8],[7,8],[7,0]]];
                //var stateData = [[[0,0], [0,5], [3,5], [3,0]]];
                var startPoint;
                var leftmost = [];
                var topmost = [];
                var leftOffset, topOffset;
                var allVertices = [];

                var newVertex = function(coords){
                    var margin = 50;
                    var scale = 50;
                    return [margin + scale * (coords[0] - leftOffset), margin + scale * (-coords[1] + topOffset)];
                };

                _.each(stateData, function (shape) {
                    leftmost.push((_.minBy(shape, function (points) {
                        return points[0]
                    }))[0]);
                    topmost.push((_.maxBy(shape, function (points) {
                        return points[1]
                    }))[1]);
                });

                leftOffset = _.min(leftmost);
                topOffset = _.max(topmost);

                _.each(stateData, function (shape) {
                    var shapeVertices = [];

                    ctx.beginPath();
                    ctx.fillStyle = "#000000".replace(/0/g, function () {
                        return (~~(Math.random() * 16)).toString(16);
                    });

                    startPoint = newVertex(shape.shift());
                    shapeVertices.push(startPoint);
                    ctx.moveTo(startPoint[0], startPoint[1]);

                    _.each(shape, function (vtx) {
                        var nextPoint = newVertex(vtx);
                        shapeVertices.push(nextPoint);
                        ctx.lineTo(nextPoint[0], nextPoint[1]);
                    });
                    allVertices.push(shapeVertices);

                    ctx.closePath();
                    ctx.stroke();
                    ctx.fill();

                });
                //var labelData = window.RegionLabel(allVertices);
                window.RegionLabel(allVertices, ctx);

            }

        } else {
            console.log('Error: ' + xhr.status);
        }
    }
};
