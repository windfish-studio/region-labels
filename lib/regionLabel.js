'use strict';

import {generateBoundingBox} from "./util/generateBoundingBox";
import {generatePointGrid} from "./util/generatePointGrid";
import {spawnCanvas} from "./util/spawnCanvas";
import {wrapLongitude} from "./util/wrapLongitude";
import {geoJsonIterateVertices} from "./util/geojsonIterateVerts";

import {LabelGroup} from "./labelGroup";

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
            wrapLongitudeTolerance: 180,
            dbscanClustering: false,
            dbscanPointDensity: 10,
            forceSingleLabel: false
        }, opts);

        this.bbox = {
            absolute: null,
            normalized: null
        };

        this.margin = opts.margin || 0;
        this.worldCanvas = opts.canvas || spawnCanvas(opts.canvasDims);
        this.groupData = [];
        this.labelGroups = [];

        this.createGroupings(geojson);
        this.normalizeVertices(this.worldCanvas);
        this.calculateGroupLabels();
    }

    createGroupings(geojson) {

        //Wrap all the geography that crosses the +/- 180º longitude barrier
        if(this.opts.wrapLongitude){
            wrapLongitude(geojson, this.opts.wrapLongitudeTolerance);
        }

        //collect all vertices from the GeoJSON
        const vertsOnly = [];
        geoJsonIterateVertices(geojson, (v) => {vertsOnly.push(v)});

        //set this.bbox.absolute to the bounding box which encompasses ALL the GeoJSON vertices
        this.bbox.absolute = generateBoundingBox(vertsOnly);

        const createGroup = () => {
            const _g = {'shapes': [], 'label': null};
            this.groupData.push(_g);
            return _g;
        };

        //parse GeoJSON
        let group;
        const aggregateFeature = (_f) => {
            const shapes = [];
            geoJsonIterateVertices(_f, (v) => {shapes.push(v)});
            const label = (typeof this.opts.label == 'function')? this.opts.label(_f.properties) : this.opts.label;
            const excluded = this.opts.excludeFeatures(_f.properties);

            if(this.opts.dbscanClustering){
                // const dbscan = new DBSCAN();
                // const pointGrid = generatePointGrid();

            }else{
                if( !this.opts.forceSingleLabel || group === undefined){
                    //create a new grouping for each feature
                    group = createGroup();
                }

                group.label = label;
                group.shapes = group.shapes.concat(shapes.map((verts) => {
                    return {
                        excluded: excluded,
                        vertices: verts
                    };
                }));
            }
        };

        if(geojson.type && geojson.type === 'FeatureCollection'){
            geojson.features.forEach(aggregateFeature.bind(this));
        }else{
            aggregateFeature(geojson); //geojson is a feature;
        }
    }

    normalizeVertices(canvas) {

        var pixelWidth, pixelHeight, pixelRatio, hRatio, vRatio;
        var canvasDims = [];

        canvasDims.push(canvas.width - this.margin);
        canvasDims.push(canvas.height - this.margin);

        const bbox = this.bbox.absolute;

        var newVertex = (coords) => {
            return [
                ((vRatio == pixelRatio)? (canvasDims[0] / 2 - pixelWidth / 2) : 0) + this.margin/2 + pixelRatio * (coords[0] - bbox.minX),
                ((hRatio == pixelRatio)? (canvasDims[1] / 2 - pixelHeight / 2) : 0) + this.margin/2 + -pixelRatio * (coords[1] - bbox.maxY)
            ];
        };

        hRatio = canvasDims[0] / bbox.width;
        vRatio = canvasDims[1] / bbox.height;

        pixelRatio = Math.min ( hRatio, vRatio );
        pixelWidth = pixelRatio * bbox.width;
        pixelHeight = pixelRatio * bbox.height;

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


        //collect all normalized vertices
        const vertsOnly = this.groupData.map(_g => {return _g.shapes.map(_s => {return _s.vertices}) });

        //set this.bbox.normalized to the bounding box which encompasses all the normalized vertices
        this.bbox.normalized = generateBoundingBox(vertsOnly);
    };

    calculateGroupLabels(){
        this.groupData.forEach((g_data) => {
            this.labelGroups.push(new LabelGroup(g_data, {
                totalBbox: this.bbox.normalized,
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