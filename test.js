import {RegionLabel} from "./lib/regionLabel.js";
import test from 'ava';

import {
    flattenDeep,
    flatten,
    cloneDeep
} from 'lodash';

const collateGeometry = require('./demo/collate_geometry');
const geometries_ar = collateGeometry(require('./demo/data/index'));
const geometries_o = {};
geometries_ar.forEach(function (_item) {
    geometries_o[_item.name] = _item;
});

const roundArray = function(ar){
    return ar.map(function (_item) {
        return parseFloat(_item.toFixed(2));
    })
};

const testLabelData = function (ld, t, expected_ar) {
    t.is(expected_ar.shift(), parseFloat(ld.fontSize.toFixed(2)));
    t.deepEqual(expected_ar, roundArray(flattenDeep(ld.letters.map(function (_l) {
        return [_l.angle, _l.width, _l.point];
    }))));
};

const testSplineData = function (sd, t, expected_ar) {
    t.deepEqual(roundArray(flatten([sd.firstPoint, sd.lastPoint].map(function (_p) {
        return _p.absolute;
    }))), expected_ar.splice(0,4), "spline entry/exit points are correct");
    t.deepEqual(roundArray(sd.spline.equation), expected_ar.splice(0,3), "spline equation matches");
    t.deepEqual(roundArray(flatten([sd.longestRay.start, sd.longestRay.end])), expected_ar.splice(0,4), "longestRay data matches");
    t.deepEqual(roundArray(flattenDeep(sd.midPointRays)), expected_ar, "longestRay data matches");
};

test('should use DBSCAN to correctly separate USA into logical labeling groups', (t) => {
    const _o = geometries_o['test_usa_dbscan_labels'];
    const rl = new RegionLabel(cloneDeep(_o.geojson), Object.assign({
        canvasDims: [256, 256]
    }, _o.opts));
    t.is(rl.groupData.length, 2, "should create two groups");
});

test('should generate labels for all test geographies without issue', (t) => {
    t.notThrows(function () {
        geometries_ar.forEach(function (_o) {
            console.log('Generating label for '+ _o.name);

            let opts;
            if(_o.type == 'Grouping'){
                opts = Object.assign({}, _o.opts);
            }else{
                opts = {};
            }

            Object.assign(opts, {
                canvasDims: [256, 256]
            });

            new RegionLabel(cloneDeep(_o.geojson || _o), opts);
        });
    }, "should generate all test case labels");
});

test('should generate correct label data for Texas', (t) => {
    var _o = geometries_o['Texas'];
    var rl = new RegionLabel(cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    var lg = rl.getLabelGroups()[0];
    var sd = lg.getSplineData();
    testSplineData(sd, t, [
        69.76, 96.07, 211.07, 177.09,
        -21.73, 0.32, 0.00,
        6.88, 120.20, 238.62, 159.92,
        58.47, 167.16, 83.02, 23.88, 117.27, 172.00, 135.56, 65.28, 167.32, 227.98, 193.37, 75.93
    ]);

    var ld = lg.getLabelData();
    testLabelData(ld, t, [
        48.18,
        0.38, 32.78, 74.86, 109.56, 0.46, 30.14, 104.32, 121.32, 0.54, 27.44, 130.46, 134.44, 0.61, 30.14, 153.32, 148.07, 0.67, 27.44, 177.49, 164.79
    ]);
});

test('should generate correct label data for New Jersey', (t) => {
    var _o = geometries_o['New Jersey'];
    var rl = new RegionLabel(cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    var sd = rl.getLabelGroups()[0].getSplineData();
    testSplineData(sd, t, [
        56.77, 208.29, 94.88, 33.31,
        24.87, -0.03, -0.01,
        108.87, 255.54, 157, 11.82,
        43.41, 179.31, 167.9, 203.89, 117.06, 130.54, 197.61, 146.45, 84.76, 60.86, 183.14, 80.29
    ]);
});

test('should generate correct label data for Hawaii', (t) => {
    var _o = geometries_o['Hawaii'];
    var rl = new RegionLabel(cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    var sd = rl.getLabelGroups()[0].getSplineData();
    testSplineData(sd, t, [
        93.67, 81.66, 234.91, 189.3,
        -19.16, -0.07, 0,
        38.33, 50.49, 249.17, 184.68,
        93.03, 80.9, 93.17, 80.69, 152.41, 103.98, 155.66, 98.87, 204.85, 147.25, 207.85, 142.54
    ]);
});

test('should generate correct label data for Russia. Should wrap Iultinsky District', (t) => {
    const _o = geometries_o['Russia'];
    const rl = new RegionLabel(cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    var sd = rl.getLabelGroups()[0].getSplineData();
    testSplineData(sd, t, [
        14.58, 120.63, 213.89, 132.54,
        -2.51, -0.11, 0,
        12.4, 131.01, 251.49, 122.98,
        71.36, 104.87, 72.47, 137.84, 131.14, 103.04, 132.58, 145.93, 191.12, 107.23, 192.65, 152.65
    ]);

    t.deepEqual(roundArray([rl.bbox.normalized.width, rl.bbox.normalized.height]), [256, 61.04]);
});