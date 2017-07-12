'use strict';

var _ = require("lodash");

var xhr = new XMLHttpRequest();
xhr.open('GET', 'data/geo.json');
xhr.send(null);

xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
        if (xhr.status === 200) {
            var states = JSON.parse(xhr.responseText);
            var rl;

            var canvas = document.getElementById('c');
            canvas.width = document.body.clientWidth;
            canvas.height = document.body.clientHeight;
            var ctx = canvas.getContext('2d');

            var debugDrawSpline = function (splineData) {

                var _s = splineData;

                var numPerpSegments = 20;
                var raySegment = _s.longestRay.length / numPerpSegments;
                var rayHalf = _s.longestRay.length / 2;

                var splineEquation = splineData.spline.equation;

                ctx.strokeStyle = "#0F0";
                ctx.lineWidth = 2;
                ctx.beginPath();
                for(var i = 0; i <= numPerpSegments; i++){
                    var x = - rayHalf + i * raySegment;
                    var y = splineEquation[2] * Math.pow(x,2) + splineEquation[1] * x + splineEquation[0];
                    var p = rl.untranslate([x,y], _s.longestRay.center, _s.longestRay.slope);
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


                ctx.fillStyle = '#F00';

                //draw spline entry/exit points
                _.each(['firstPoint', 'lastPoint'], function (_k) {
                    var p = splineData[_k].absolute;
                    ctx.beginPath();
                    ctx.arc(p[0], p[1], 5, 2 * Math.PI, 0);
                    ctx.closePath();
                    ctx.fill();
                });

            };

            var renderState = function(state){

                var newVertex = function(coords){

                    var width = bbox[2] - bbox[0];
                    var height = bbox[3] - bbox[1];

                    var hRatio = canvas.width / width;
                    var vRatio = -(canvas.height / height);
                    var ratio  = Math.min ( hRatio, vRatio );

                    return [ratio * (coords[0] - bbox[0]), ratio * (-coords[1] + bbox[1])];
                };

                var stateData = states[state];

                var bbox = [],
                    leftmost = [],
                    topmost = [],
                    rightmost = [],
                    bottommost = [],
                    allVertices = [];

                _.each(stateData, function (shape) {

                    leftmost.push((_.minBy(shape, function (points) {
                        return points[0]
                    }))[0]);

                    topmost.push((_.maxBy(shape, function (points) {
                        return points[1]
                    }))[1]);

                    rightmost.push((_.maxBy(shape, function (points) {
                        return points[0]
                    }))[0]);

                    bottommost.push((_.minBy(shape, function (points) {
                        return points[1]
                    }))[1]);

                });

                bbox.push(_.min(leftmost));
                bbox.push(_.max(topmost));
                bbox.push(_.max(rightmost));
                bbox.push(_.min(bottommost));

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                _.each(stateData, function (shape) {
                    var shapeVertices = [];
                    var startPoint = newVertex(shape.shift());
                    shapeVertices.push(startPoint);

                    ctx.fillStyle = "#CCC";
                    ctx.strokeStyle = "#000";
                    ctx.beginPath();
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

                rl = new RegionLabel(allVertices, state);
                var labelData = rl.getLabelData();

                ctx.font = labelData.font + 'px sans-serif';

                _.each(labelData.letters, function(obj) {
                    ctx.save();
                    ctx.translate(obj.point[0], obj.point[1]);
                    ctx.rotate(obj.angle);
                    ctx.fillStyle = "#000";
                    ctx.fillText(obj.letter, 0, 0);
                    ctx.restore();
                });

                debugDrawSpline(rl.getSplineData());
            };

            var stateNames = Object.keys(states);

            var selectBox = document.createElement("select");
            _.each(stateNames, function(name){
                var opt = document.createElement("option");
                opt.value = name;
                opt.text = name;
                selectBox.appendChild(opt);
            });
            selectBox.style.position = 'fixed';
            selectBox.style.top = '0px';
            selectBox.style.left = '0px';

            document.body.appendChild(selectBox);
            if (selectBox.value) renderState(selectBox.value);

            selectBox.onchange = function(event){ renderState(event.target.value) }

        } else {
            console.log('Error: ' + xhr.status);
        }
    }
};
