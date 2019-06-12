import flattenDeep from "lodash/flattenDeep";
import minBy from "lodash/minBy";
import maxBy from "lodash/maxBy";

export function generateBoundingBox (allPoints) {
    allPoints = flattenDeep(allPoints);
    const _pts = [];
    for(let i = 0; i < allPoints.length; i += 2){
        _pts.push([allPoints[i], allPoints[i+1]]);
    };

    //double-flatten polygons to get a single list of verts
    const bbox = {
        minX: minBy(_pts, (vtx) => {
            return vtx[0]
        })[0],
        minY: minBy(_pts, (vtx) => {
            return vtx[1]
        })[1],
        maxX: maxBy(_pts, (vtx) => {
            return vtx[0]
        })[0],
        maxY: maxBy(_pts, (vtx) => {
            return vtx[1]
        })[1],
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
    bbox.width = bbox.maxX - bbox.minX;
    bbox.height = bbox.maxY - bbox.minY;
    bbox.area = (bbox.width * bbox.height);
    bbox.points = [[bbox.minX, bbox.minY], [bbox.minX, bbox.maxY], [bbox.maxX, bbox.maxY], [bbox.maxX, bbox.minY]];
    bbox.center = [bbox.minX + bbox.width / 2, bbox.minY + bbox.height / 2];

    return bbox;
}