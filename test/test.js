import {RegionLabel} from "../lib/regionLabel.js";
import test from 'ava';

import {
    flattenDeep,
    flatten,
    cloneDeep
} from 'lodash';

import * as $expected from "./expected.json";

const collateGeometry = require('../demo/collate_geometry');
const rawData = require('../demo/data').concat(require('./edgecase_geo'));
const geometries_ar = collateGeometry(rawData);
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

    var lg = rl.getLabelGroups()[0];
    var sd = lg.getSplineData();
    testSplineData(sd, t, $expected['test_usa_dbscan_labels'].spline[0]);

    lg = rl.getLabelGroups()[1];
    sd = lg.getSplineData();
    testSplineData(sd, t, $expected['test_usa_dbscan_labels'].spline[1]);
});

test('should generate labels for all test geographies without issue', (t) => {
    t.notThrows(function () {
        geometries_ar.forEach(function (_o) {
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
    const _o = geometries_o['Texas'];
    const _e = $expected['Texas'];
    const rl = new RegionLabel(cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    const lg = rl.getLabelGroups()[0];
    const sd = lg.getSplineData();
    testSplineData(sd, t, _e.spline);

    const ld = lg.getLabelData();
    testLabelData(ld, t, _e.label);
});

test('should generate correct label data for New Jersey', (t) => {
    const _o = geometries_o['New Jersey'];
    const _e = $expected['New Jersey'];
    const rl = new RegionLabel(cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    const sd = rl.getLabelGroups()[0].getSplineData();
    testSplineData(sd, t, _e.spline);
});

test('should generate correct label data for Hawaii', (t) => {
    var _o = geometries_o['Hawaii'];
    const _e = $expected['Hawaii'];
    var rl = new RegionLabel(cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    var sd = rl.getLabelGroups()[0].getSplineData();
    testSplineData(sd, t, _e.spline);
});

test('should generate correct label data for Russia. Should wrap Iultinsky District', (t) => {
    const _o = geometries_o['Russia'];
    const _e = $expected['Russia'];
    const rl = new RegionLabel(cloneDeep(_o), {
        canvasDims: [256, 256],
        label: _o.label
    });

    var sd = rl.getLabelGroups()[0].getSplineData();
    testSplineData(sd, t, _e.spline);

    t.deepEqual(roundArray([rl.bbox.normalized.width, rl.bbox.normalized.height]), [256, 61.04]);
});