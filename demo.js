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

                var stateData = _.cloneDeep(states[state]);

                rl = new RegionLabel(stateData, state, {
                    margin: 20,
                    canvas: canvas
                });

                var stateCentered = rl.getVertices();

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                _.each(stateCentered, function (shape) {
                    ctx.fillStyle = "#CCC";
                    ctx.strokeStyle = "#000";
                    ctx.beginPath();

                    _.each(shape, function (vtx, idx) {
                        if(idx == 0)
                            ctx.moveTo(vtx[0], vtx[1]);
                        else
                            ctx.lineTo(vtx[0], vtx[1]);
                    });

                    ctx.closePath();
                    ctx.stroke();
                    ctx.fill();

                });

                //draw letters
                var labelCanvas = rl.drawLabel();
                ctx.drawImage(labelCanvas, 0, 0);

                if(drawDebug){
                    var debugCanvas = rl.debugDraw();
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
