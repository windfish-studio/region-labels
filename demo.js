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
            var drawDebug = false;

            var canvas = document.createElement('canvas');
            canvas.width = document.body.clientWidth;
            canvas.height = document.body.clientHeight;
            document.body.appendChild(canvas);
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

                var width, height, pixelWidth, pixelHeight, pixelRatio, hRatio, vRatio;
                var canvasDims = [];
                var margin = 20;

                var newVertex = function(coords){
                    return [
                        ((vRatio == pixelRatio)? (canvasDims[0] / 2 - pixelWidth / 2) : 0) + margin/2 + pixelRatio * (coords[0] - bbox[0]),
                        ((hRatio == pixelRatio)? (canvasDims[1] / 2 - pixelHeight / 2) : 0) + margin/2 + pixelRatio * (-coords[1] + bbox[1])
                    ];
                };

                var stateData = _.cloneDeep(states[state]);

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

                width = bbox[2] - bbox[0];
                height = bbox[3] - bbox[1];

                canvasDims.push(canvas.width - margin);
                canvasDims.push(canvas.height - margin);

                hRatio = canvasDims[0] / width;
                vRatio = -(canvasDims[1] / height);

                pixelRatio = Math.min ( hRatio, vRatio );
                pixelWidth = pixelRatio * width;
                pixelHeight = pixelRatio * -height;

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

                //draw letters
                var labelCanvas = rl.drawLabel([canvas.width, canvas.height]);
                ctx.drawImage(labelCanvas, 0, 0);

                if(drawDebug)
                    debugDrawSpline(rl.getSplineData());
            };

            var stateNames = _.sortBy(Object.keys(states));

            //add state select box
            var selectBox = document.createElement("select");
            _.each(stateNames, function(name){
                var opt = document.createElement("option");
                opt.value = name;
                opt.text = name;
                selectBox.appendChild(opt);
            });

            selectBox.addEventListener('change', function(event){ renderState(event.target.value) });

            //add debug draw textbox
            var debugCbContainer = document.createElement('label');

            var debugCb = document.createElement('input');
            debugCb.type = 'checkbox';
            debugCb.addEventListener('change', function (event) {
                drawDebug = event.target.checked;
                renderState(selectBox.value);
            });

            var container = document.createElement('div');
            container.className = 'inputs';

            debugCbContainer.appendChild(document.createTextNode('Draw Debug Data'));

            debugCbContainer.appendChild(debugCb);
            container.appendChild(selectBox);
            container.appendChild(debugCbContainer);
            document.body.appendChild(container);

            if (selectBox.value)
                renderState(selectBox.value);

            window.addEventListener('resize', function () {
                canvas.width = document.body.clientWidth;
                canvas.height = document.body.clientHeight;
                renderState(selectBox.value);
            });


        } else {
            console.log('Error: ' + xhr.status);
        }
    }
};
