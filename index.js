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
            var ctx = canvas.getContext('2d');

            var renderState = function(state){
                function newVertex(coords){
                    var margin = 50;
                    var scale = 50;
                    return [margin + scale * (coords[0] - leftOffset), margin + scale * (-coords[1] + topOffset)];
                }
                var stateData = states[state];

                var leftOffset, topOffset,leftmost = [],topmost = [], allVertices = [];

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

                ctx.clearRect(0, 0, canvas.width, canvas.height);

                _.each(stateData, function (shape) {
                    var shapeVertices = [];
                    var startPoint = newVertex(shape.shift());
                    shapeVertices.push(startPoint);

                    ctx.fillStyle = "#000000".replace(/0/g, function () {
                        return (~~(Math.random() * 16)).toString(16);
                    });
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
                var labelData = window.RegionLabel(allVertices, state);
                ctx.font = labelData.font + 'px sans-serif';

                _.each(labelData.letters, function(obj) {
                    ctx.save();
                    ctx.translate(obj.point[0], obj.point[1]);
                    ctx.rotate(obj.angle);
                    ctx.fillStyle = "#ff0000";
                    ctx.fillText(obj.letter, 0, 0);
                    ctx.restore();
                });
            };

            var stateNames = Object.keys(states);

            var selectBox = document.createElement("select");
            _.each(stateNames, function(name){
                if (name === 'Alaska')
                    return;
                var opt = document.createElement("option");
                opt.value = name;
                opt.text = name;
                selectBox.appendChild(opt);
            });
            document.body.appendChild(selectBox);
            if (selectBox.value) renderState(selectBox.value);

            selectBox.onchange = function(event){ renderState(event.target.value) }

        } else {
            console.log('Error: ' + xhr.status);
        }
    }
};
