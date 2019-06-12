const pip = require("point-in-polygon");

import range from "lodash/range";

export function pointInside (point, shapes) {
    let match = null;

    shapes.forEach((poly) => {
        poly.forEach((shape, idx) => {
            if (pip(point, shape)) {
                if(idx == 0){
                    match = true;
                }else{ //point is in hole within polygon (in 'empty space')
                    match = false;
                }
            }
        });

        if(match === false || match === true)
            return; //exit loop early if match has been definitively set
    });

    return match;
}

export function generatePointGrid (bbox, density, shapes) {
    const grid = [];
    //get a list of all points (with some offset) inside all shapes used for least squares regression
    range(bbox.minX, bbox.maxX + 1, (bbox.width + 1) / density).forEach((x) => {
        range(bbox.minY, bbox.maxY + 1, (bbox.height + 1) / density).forEach((y) => {
            const p = [x,y];
            if(pointInside(p, shapes)){
                grid.push(p);
            }
        });
    });

    return grid;
}
