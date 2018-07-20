'use strict';

var _ = require("lodash");
var q = require("q");
var raw_data = require('./data/index.js') ;

var rl;
var drawDebug = false;

var canvas = document.createElement('canvas');
canvas.width = document.body.clientWidth;
canvas.height = document.body.clientHeight;
document.body.appendChild(canvas);
var ctx = canvas.getContext('2d');
var labelTargets = {};

//recursively iterate through the demo data and fill the dropdown with options
function parseDemoData(_d) {
    if(_d instanceof Array){
        _.each(_d, function (datum) {
            parseDemoData(datum);
        });
    }else if(_d instanceof Object){
        if(_d.type)
            switch(_d.type){
                case 'Grouping':
                    labelTargets[_d.optionsName] = _d;
                    break;
                case 'FeatureCollection':
                    parseDemoData(_d.features);
                    break;
                case 'Feature':
                    labelTargets[_d.properties.NAME] = _d;
                    break;
            }
        else
            _.each(_d, function (_v) {
                parseDemoData(_v);
            });
    }
}

parseDemoData(raw_data);

var renderFeature = function(selected_target){

    var target = labelTargets[selected_target];
    if(target.type == 'Grouping'){
        rl = new RegionLabel(_.cloneDeep(target.groupCollection), {
            margin: 20,
            canvas: canvas,
            label: target.label,
            excludeFeatures: target.excludeFeatures
        });
    }else{
        rl = new RegionLabel(_.cloneDeep(labelTargets[selected_target]), {
            margin: 20,
            canvas: canvas,
            label: selected_target
        });
    }


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
_.each(labelTargets, function(undefined, name){
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

