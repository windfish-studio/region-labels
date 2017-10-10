'use strict';

var _ = require("lodash");
var q = require("q");
var data_ar = require('./data/index.js');

var rl;
var drawDebug = false;

var canvas = document.createElement('canvas');
canvas.width = document.body.clientWidth;
canvas.height = document.body.clientHeight;
document.body.appendChild(canvas);
var ctx = canvas.getContext('2d');
var features = {};
_.each(data_ar, function (featureCollection) {
    _.each(featureCollection.features, function (feature) {
        features[feature.properties.NAME] = feature;
    });
});

var renderFeature = function(selected_feature){

    rl = new RegionLabel(_.cloneDeep(features[selected_feature]), selected_feature, {
        margin: 20,
        canvas: canvas
    });

    var featureCentered = rl.getVertices();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    _.each(featureCentered, function (poly, s_idx) {
        ctx.fillStyle = "#CCC";
        ctx.strokeStyle = "#000";
        ctx.beginPath();

        _.each(poly, function (shape) {
            _.each(shape, function (vtx, v_idx) {
                if(v_idx == 0)
                    ctx.moveTo(vtx[0], vtx[1]);
                else
                    ctx.lineTo(vtx[0], vtx[1]);
            });
            ctx.closePath();
        });

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

var geoKeys = _.sortBy(Object.keys(features));

//add state select box
var selectBox = document.createElement("select");
_.each(geoKeys, function(name){
    var opt = document.createElement("option");
    opt.value = name;
    opt.text = name;
    selectBox.appendChild(opt);
});

selectBox.addEventListener('change', function(event){ renderFeature(event.target.value) });

//add debug draw textbox
var debugCbContainer = document.createElement('label');

var debugCb = document.createElement('input');
debugCb.type = 'checkbox';
debugCb.addEventListener('change', function (event) {
    drawDebug = event.target.checked;
    renderFeature(selectBox.value);
});

var container = document.createElement('div');
container.className = 'inputs';

debugCbContainer.appendChild(document.createTextNode('Draw Debug Data'));

debugCbContainer.appendChild(debugCb);
container.appendChild(selectBox);
container.appendChild(debugCbContainer);
document.body.appendChild(container);

if (selectBox.value)
    renderFeature(selectBox.value);

window.addEventListener('resize', function () {
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
    renderFeature(selectBox.value);
});

