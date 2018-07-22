'use strict';

var _ = require("lodash");
var q = require("q");
var raw_data = require('../data/index.js');
var collateGeometry = require('./collate_geometry');

var rl;
var drawDebug = false;

var initDemo = function () {
    var canvas = document.createElement('canvas');
    canvas.width = document.body.clientWidth;
    canvas.height = document.body.clientHeight;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var labelTargets = collateGeometry(raw_data);

    var renderFeature = function(target){

        rl = new RegionLabel(_.cloneDeep(target.groupCollection || target), {
            margin: 20,
            canvas: canvas,
            label: target.label,
            excludeFeatures: target.excludeFeatures
        });

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var geometryCanvas = rl.drawGeometries();
        ctx.drawImage(geometryCanvas, 0, 0);

        //draw letters
        var labelCanvas = rl.drawLabels();
        ctx.drawImage(labelCanvas, 0, 0);

        if(drawDebug){
            var debugCanvas = rl.debugDraw();
            ctx.drawImage(debugCanvas, 0, 0);
        }

    };

    //add state select box
    var selectBox = document.createElement("select");
    labelTargets.forEach(function(feat, idx){
        var opt = document.createElement("option");
        opt.value = idx;
        opt.text = feat.name;
        selectBox.appendChild(opt);
    });

    selectBox.addEventListener('change', function(event){ renderFeature(labelTargets[event.target.value]) });

    //add debug draw textbox
    var debugCbContainer = document.createElement('label');

    var debugCb = document.createElement('input');
    debugCb.type = 'checkbox';
    debugCb.addEventListener('change', function (event) {
        drawDebug = event.target.checked;
        renderFeature(labelTargets[selectBox.value]);
    });

    var container = document.createElement('div');
    container.className = 'inputs';

    debugCbContainer.appendChild(document.createTextNode('Draw Debug Data'));

    debugCbContainer.appendChild(debugCb);
    container.appendChild(selectBox);
    container.appendChild(debugCbContainer);
    document.body.appendChild(container);

    if (selectBox.value)
        renderFeature(labelTargets[selectBox.value]);

    window.addEventListener('resize', function () {
        canvas.width = document.body.clientWidth;
        canvas.height = document.body.clientHeight;
        renderFeature(labelTargets[selectBox.value]);
    });
};

window.addEventListener('DOMContentLoaded', initDemo);

