import flattenDeep from "lodash/flattenDeep";

export function generateBoundingBox (allPoints) {
    allPoints = flattenDeep(allPoints);
    const _pts = [];
    for(let i = 0; i < allPoints.length; i += 2){
        _pts.push([allPoints[i], allPoints[i+1]]);
    };

    //double-flatten polygons to get a single list of verts
    const bbox = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        within: (p) => {
            return (this.withinX(p) && this.withinY(p));
        },

        withinX: (p) => {
            return (p[0] <= this.maxX && p[0] >= this.minX);
        },

        withinY: (p) => {
            return (p[1] <= this.maxY && p[1] >= this.minY);
        }
    };

    _pts.forEach(_p => {
        if(_p[0] < bbox.minX){
            bbox.minX = _p[0];
        }
        if(_p[0] > bbox.maxX){
            bbox.maxX = _p[0];
        }
        if(_p[1] < bbox.minY){
            bbox.minY = _p[1];
        }
        if(_p[1] > bbox.maxY){
            bbox.maxY = _p[1];
        }
    });

    bbox.width = bbox.maxX - bbox.minX;
    bbox.height = bbox.maxY - bbox.minY;
    bbox.area = (bbox.width * bbox.height);
    bbox.points = [[bbox.minX, bbox.minY], [bbox.minX, bbox.maxY], [bbox.maxX, bbox.maxY], [bbox.maxX, bbox.minY]];
    bbox.center = [bbox.minX + bbox.width / 2, bbox.minY + bbox.height / 2];

    return bbox;
}