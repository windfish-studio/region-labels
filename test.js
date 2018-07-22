var RegionLabel = require('.');
var tape = require('tape');
var collateGeometry = require('./demo/collate_geometry');
var _ = require('lodash');
var chalk = require('chalk-log');

var geometries_ar = collateGeometry(require('./data/index'));
var geometries_o = {};
geometries_ar.forEach(function (_item) {
    geometries_o[_item.name] = _item;
});

var roundArray = function(ar){
    return ar.map(function (_item) {
        return parseFloat(_item.toFixed(2));
    })
};

tape('should generate labels for all test geographies without issue', function (t) {
    t.doesNotThrow(function () {
        geometries_ar.forEach(function (_o) {
            chalk.log('Generating label for '+ _o.name);
            var rl = new RegionLabel(_.cloneDeep(_o.groupCollection || _o), {
                canvasDims: [256, 256],
                label: _o.label,
                excludeFeatures: _o.excludeFeatures
            });
        });
    }, "should generate all test case labels");
    t.end();
});

tape('should generate correct label data for Texas', function (t) {
    var _o = geometries_o['Texas'];
    var rl = new RegionLabel(_.cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    var sd = rl.getLabelGroups()[0].getSplineData();

    t.deepEqual(roundArray(sd.spline.equation), [-21.73, 0.32, 0.00], "spline equation matches");
    t.deepEqual(roundArray(_.flatten([sd.longestRay.start, sd.longestRay.end])), [6.88, 120.20, 238.62, 159.92], "longestRay data matches");
    t.deepEqual(roundArray(_.flattenDeep(sd.midPointRays)), [58.47, 167.16, 83.02, 23.88, 117.27, 172.00, 135.56, 65.28, 167.32, 227.98, 193.37, 75.93], "longestRay data matches");
    t.end();
});