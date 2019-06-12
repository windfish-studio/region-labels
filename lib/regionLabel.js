'use strict';

import {generateBoundingBox} from "./util/generateBoundingBox";
import {LabelGroup} from "./labelGroup";
import {spawnCanvas} from "./util/spawnCanvas";
import {DBSCAN} from "density-clustering";

export class RegionLabel {

    constructor(geojson, opts) {

        //set default options
        this.opts = Object.assign({
            pointDensity: 50,
            canvasDims: [256, 256],
            label: function (_props) { return _props.NAME; },
            excludeFeatures: function () { return false; },
            excludeHoles: true,
            wrapLongitude: true,
            wrapLongitudeTolerance: 180
        }, opts);

        this.totalBbox = null;
        this.margin = opts.margin || 0;
        this.worldCanvas = opts.canvas || spawnCanvas(opts.canvasDims);
        this.groupData = [];
        this.labelGroups = [];

        this.createGroupings(geojson);
        this.centerVertices(this.worldCanvas);
        this.calculateGroupLabels();
    }

    static doWrapLongitude (feature, tolerance) {

        tolerance = tolerance || 180;

        var testLongitude = (x1, x2) => {
            return (Math.abs(x2 - x1) < tolerance);
        };

        var allShapesBbox = [];
        var largestBbox;

        RegionLabel.iterateVertices(feature, (coords, _coords_idx) => {
            allShapesBbox.push([]);
            coords.forEach( (shape) => {
                var newBbox = generateBoundingBox([[shape]]);
                allShapesBbox[_coords_idx].push(newBbox);
                if(!largestBbox){
                    largestBbox = newBbox;
                }else if(largestBbox.area < newBbox.area){
                    largestBbox = newBbox;
                }
            });

        });

        RegionLabel.iterateVertices(feature, (coords, _coords_idx) => {

            var newPoly = [];
            coords.forEach((shape, _shape_idx) => {
                var shapeBbox = allShapesBbox[_coords_idx][_shape_idx];
                var newShape = [];

                if(!testLongitude(shapeBbox.minX, shapeBbox.maxX)){
                    //if the bbox is wider than wrapLongitudeTolerance, we examine/adjust internal vertices

                    var lastVtx = null;
                    shape.forEach((vtx) => {
                        var newVtx = null;
                        if(lastVtx && !testLongitude(lastVtx[0], vtx[0])){
                            var delta = (lastVtx[0] < vtx[0])? -360 : 360;
                            newVtx = [vtx[0] + delta, vtx[1]];
                            lastVtx = newVtx;
                        }else{
                            lastVtx = vtx;
                            newVtx = vtx.slice();
                        }

                        newShape.push(newVtx);
                    });

                    //recalculate bbox now that everything is together.
                    shapeBbox = generateBoundingBox([[newShape]]);
                }else{
                    newShape = shape.slice();
                }

                if (!testLongitude(largestBbox.center[0], shapeBbox.center[0])){
                    var delta = (largestBbox.center[0] < shapeBbox.center[0])? -360 : 360;
                    var shiftedShape = [];
                    newShape.forEach((vtx) => {
                        shiftedShape.push([vtx[0] + delta, vtx[1]]);
                    });
                    coords[_shape_idx] = shiftedShape;
                }else{
                    coords[_shape_idx] = newShape;
                }
            });
        });
    };

    static iterateVertices(feature, iter){
        switch(feature.geometry.type){
            case 'MultiPolygon':
                feature.geometry.coordinates.forEach((_v, _i) => {
                    iter(_v, _i);
                });
                break;
            case 'Polygon':
                var verts = feature.geometry.coordinates;
                iter(verts, 0);
                break;
            default:
                throw 'geometry type '+feature.geometry.type+' not supported';
                break;
        }
    }

    createGroupings(geojson) {
        var _g = geojson;

        //parse GeoJSON
        var aggregateFeature = (_f, group) => {

            if(this.opts.wrapLongitude){
                RegionLabel.doWrapLongitude(_f, this.opts.wrapLongitudeTolerance);
            }

            var excluded = this.opts.excludeFeatures(_f.properties);
            RegionLabel.iterateVertices(_f, (verts) => {
                group.shapes.push({
                    excluded: excluded,
                    vertices: verts
                });
            });

        };

        const singleGroup = (typeof this.opts.label != 'function');

        let group;
        if(singleGroup){
            group = {'shapes': [], 'label': this.opts.label};
            this.groupData.push(group);
        }

        if(_g.type && _g.type === 'FeatureCollection'){
            _g.features.forEach((feat) => {
                if(!singleGroup){
                    //make a new group for each feature
                    group = {'shapes': [], 'label': this.opts.label(feat.properties)};
                    this.groupData.push(group);
                }
                aggregateFeature(feat, group);
            });
        }else{
            aggregateFeature(_g, group); //geojson is a feature;
        }
    }

    centerVertices(canvas) {

        var pixelWidth, pixelHeight, pixelRatio, hRatio, vRatio;
        var canvasDims = [];

        canvasDims.push(canvas.width - this.margin);
        canvasDims.push(canvas.height - this.margin);

        var newVertex = (coords) => {
            return [
                ((vRatio == pixelRatio)? (canvasDims[0] / 2 - pixelWidth / 2) : 0) + this.margin/2 + pixelRatio * (coords[0] - this.totalBbox.minX),
                ((hRatio == pixelRatio)? (canvasDims[1] / 2 - pixelHeight / 2) : 0) + this.margin/2 + -pixelRatio * (coords[1] - this.totalBbox.maxY)
            ];
        };

        var regenerateBbox = () => {
            this.totalBbox = generateBoundingBox(this.groupData.map((l_group) => {
                return l_group.shapes.map((p_obj) => {
                    return p_obj.vertices;
                });
            }));
        };

        regenerateBbox();

        hRatio = canvasDims[0] / this.totalBbox.width;
        vRatio = canvasDims[1] / this.totalBbox.height;

        pixelRatio = Math.min ( hRatio, vRatio );
        pixelWidth = pixelRatio * this.totalBbox.width;
        pixelHeight = pixelRatio * this.totalBbox.height;

        //turn geo coords into screen coords
        this.groupData.forEach((l_group) => {
            l_group.shapes.forEach((p_obj) => {
                const newPoly = [];
                p_obj.vertices.forEach((shape) => {
                    const shapeVertices = [];
                    shape.forEach((vtx) => {
                        shapeVertices.push(newVertex(vtx));
                    });

                    newPoly.push(shapeVertices);
                });
                p_obj.vertices = newPoly;
            });
        });

        //recalculate bounding box
        regenerateBbox();
    };

    calculateGroupLabels(){
        this.groupData.forEach((g_data) => {
            this.labelGroups.push(new LabelGroup(g_data, {
                totalBbox: this.totalBbox,
                worldCanvas: this.worldCanvas,
                excludeHoles: this.opts.excludeHoles,
                pointDensity: this.opts.pointDensity
            }));
        });
    };

    drawEachGroup(todo, args) {
        const canvas = spawnCanvas([this.worldCanvas.width, this.worldCanvas.height]);
        const ctx = canvas.getContext('2d');
        this.labelGroups.forEach((l_group) => {
            ctx.drawImage(l_group[todo].apply(l_group, args), 0, 0);
        });
        return canvas;
    };

    getLabelGroups () {
        return this.labelGroups;
    };

    drawLabels () {
        return this.drawEachGroup('drawLabel');
    };

    debugDraw () {
        return this.drawEachGroup('debugDraw');
    };

    drawGeometries () {
        return this.drawEachGroup('drawGeometry');
    };
}