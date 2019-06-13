const pip = require("point-in-polygon");

import range from "lodash/range";

export function pointInside (point, shapes) {
    let match = undefined;

    shapes.forEach((poly) => {
        if(match !== undefined)
            return; //exit loop early if match has been definitively set

        poly.forEach((shape, idx) => {

            if(match !== undefined)
                return; //exit loop early if match has been definitively set

            if (pip(point, shape)) {
                if(idx == 0){
                    match = shape;
                }else{ //point is in hole within polygon (in 'empty space')
                    match = false;
                }
            }
        });
    });

    return match;
}

export function generatePointGrid (bbox, density, shapes) {
    const grid = [];
    //get a list of all points (with some offset) inside all shapes used for least squares regression
    range(bbox.minX, bbox.maxX + 1, (bbox.width + 1) / density).forEach((x) => {
        range(bbox.minY, bbox.maxY + 1, (bbox.height + 1) / density).forEach((y) => {
            const p = [x,y];
            const match = pointInside(p, shapes);
            if(match){
                grid.push({
                    point: p,
                    shape: match
                });
            }
        });
    });

    return grid;
}
