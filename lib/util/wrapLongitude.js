import {generateBoundingBox} from "./generateBoundingBox";
import {geoJsonIterateVertices} from "./geojsonIterateVerts";

export function wrapLongitude (geojson, tolerance) {

    if(geojson.type && geojson.type === 'FeatureCollection'){
        geojson.features.forEach(_f => {
            wrapLongitude(_f, tolerance);
        });
        return;
    }

    tolerance = tolerance || 180;

    var testLongitude = (x1, x2) => {
        return (Math.abs(x2 - x1) < tolerance);
    };

    var allShapesBbox = [];
    var largestBbox;

    geoJsonIterateVertices(geojson, (coords, _coords_idx) => {
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

    geoJsonIterateVertices(geojson, (coords, _coords_idx) => {

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