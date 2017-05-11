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
                var startPoint;
                var leftmost = [];
                var topmost = [];
                var leftOffset, topOffset;
                var allVertices = [];

                var newVertex = function(coords){
                    var margin = 50;
                    var scale = 50;
                    var vtx = [margin + scale * (coords[0] - leftOffset), margin + scale * (-coords[1] + topOffset)];
                    return vtx
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

                    ctx.beginPath();
                    ctx.fillStyle = "#000000".replace(/0/g, function () {
                        return (~~(Math.random() * 16)).toString(16);
                    });

                    startPoint = newVertex(shape.shift());

                    ctx.moveTo(startPoint[0], startPoint[1]);
                    var shapeVertices = [];

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
                var labelData = window.RegionLabel(allVertices);
                ctx.fillStyle = "#000000";
                _.each(labelData[0].points, function(p){
                    ctx.fillRect(p[0],p[1],1,1);
                });
                _.each(labelData[1].points, function(p){
                    ctx.fillRect(p[1],p[0],1,1);
                });

                //
                // ctx.beginPath();
                //
                // var curveStart = [startPoint[0] - leftOffset, -startPoint[1] + leftOffset];
                //
                // ctx.moveTo(curveStart[0], curveStart[1]);
                //
                // ctx.bezierCurveTo(curveStart[0] + 50, curveStart[0] + 40,
                //     curveStart[0] + 80, curveStart[0] + 90,
                //     curveStart[0] + 180, curveStart[0] + 130);
                //
                // ctx.stroke();
                //

            }

        } else {
            console.log('Error: ' + xhr.status);
        }
    }
};




    // _.each(states, function(state){
    //     _.each(state, function(shape, stateName){
    //         var start = shape.shift();
    //         ctx.fillStyle = "#000000".replace(/0/g,function(){return (~~(Math.random()*16)).toString(16);});
    //         ctx.beginPath();
    //         ctx.moveTo(start[0] + 200, - start[1] + 100);
    //         _.each(shape, function(vtx){
    //             ctx.lineTo(vtx[0] + 200, - vtx[1] + 100);
    //         });
    //         ctx.closePath();
    //         ctx.stroke();
    //         ctx.fill();
    //     })
    // });
