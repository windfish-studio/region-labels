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

            var renderState = function(state){

                var pixelWidth, pixelHeight, pixelRatio, hRatio, vRatio;
                var canvasDims = [];
                var margin = 20;

                var newVertex = function(coords){
                    return [
                        ((vRatio == pixelRatio)? (canvasDims[0] / 2 - pixelWidth / 2) : 0) + margin/2 + pixelRatio * (coords[0] - bbox.minX),
                        ((hRatio == pixelRatio)? (canvasDims[1] / 2 - pixelHeight / 2) : 0) + margin/2 + -pixelRatio * (coords[1] - bbox.maxY)
                    ];
                };

                var stateData = _.cloneDeep(states[state]);

                var geoCoords = Array.prototype.concat.apply([],stateData);
                var bbox = RegionLabel.generateBoundingBox(geoCoords);

                canvasDims.push(canvas.width - margin);
                canvasDims.push(canvas.height - margin);

                hRatio = canvasDims[0] / bbox.width;
                vRatio = canvasDims[1] / bbox.height;

                pixelRatio = Math.min ( hRatio, vRatio );
                pixelWidth = pixelRatio * bbox.width;
                pixelHeight = pixelRatio * bbox.height;

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                var allVertices = [];
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

                if(drawDebug){
                    var debugCanvas = rl.debugDraw([canvas.width, canvas.height]);
                    ctx.drawImage(debugCanvas, 0, 0);
                }

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
