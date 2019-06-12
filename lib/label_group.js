import sortBy from "lodash/sortBy";
import maxBy from "lodash/maxBy";
import range from "lodash/range";
import minBy from "lodash/minBy";

import {generateBoundingBox} from "./util/generateBoundingBox";
import {spawnCanvas} from "./util/spawnCanvas";
import {arcSolver} from "./util/parabolic_arclength_solver";

const p2 = require("p2");
const pip = require("point-in-polygon");
const regression = require("regression");

export class LabelGroup {

    constructor (data, context) {
        this.rawData = data;

        this.longestLine = {
            slope: null,
            intercept: null,
            angle: null,
            pslope: null,
            pintercept: null
        };

        this.ray = {
            start: null,
            end: null,
            center: null,
            length: null
        };

        this.boundaryPoints = {
            first: null,
            last: null
        };

        this.reverseLetters = null;
        this.fontSize = null;
        this.landArea = null;
        this.spline = null;
        this.relativeSplineEquation = null;

        this.relativeMidPoints = [];
        this.letterData = [];
        this.midPointRays = [];
        this.shapesArea = 0;
        this.systemOmitted = false;
        this.p2World = new p2.World();
        this.letters = data.label.split("");
        this.polygons = data.shapes.map((p_obj) => { return p_obj.vertices });

        this.bbox = generateBoundingBox([this.polygons]);

        this.totalBbox = context.totalBbox;
        this.worldCanvas = context.worldCanvas;
        this.excludeHoles = context.excludeHoles;
        this.worldCtx = this.worldCanvas.getContext('2d');

        this.calculateLetters();
    }

    getMidPoint (start, end) {
        return [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2];
    }

    calcPolygonArea(vertices) {
        //https://stackoverflow.com/questions/16285134/calculating-polygon-area
        var total = 0;
        for (var i = 0, l = vertices.length; i < l; i++) {
            var addX = vertices[i][0];
            var addY = vertices[i === vertices.length - 1 ? 0 : i + 1][1];
            var subX = vertices[i === vertices.length - 1 ? 0 : i + 1][0];
            var subY = vertices[i][1];

            total += (addX * addY * 0.5);
            total -= (subX * subY * 0.5);
        }
        return Math.abs(total);
    }

    rayFromHitPoints(hitPoints){
        if (hitPoints.length < 2)
            return false;
        var axis = (hitPoints[0].point[0] === hitPoints[1].point[0])? 1 : 0;
        var min = minBy(hitPoints, (hp) => {
            return hp.point[axis]
        });
        var max = maxBy(hitPoints, (hp) => {
            return hp.point[axis]
        });
        return [min, max];
    }

    getDist(start, end){
        var distX = end[0] - start[0];
        var distY = end[1] - start[1];
        return Math.sqrt( distX*distX + distY*distY );
    }

    getSlope(start, end){
        return (end[1] - start[1]) / (end[0] - start[0])
    }

    getPerpendicularSlope(slope){
        var perpSlope;
        switch (slope) {
            case 0:
            case -0:
                perpSlope = Infinity;
                break;
            case Infinity:
            case -Infinity:
                perpSlope = 0;
                break;
            default:
                perpSlope = -1 / slope;
                break;
        };
        return perpSlope
    }

    getHitPoints(start, end){
        var hitPoints = [];
        var ray = new p2.Ray({
            mode: p2.Ray.ALL,
            from: start,
            to: end,
            callback: (result) => {
                var hitPoint = p2.vec2.create();
                result.getHitPoint(hitPoint, ray);
                if (result.hasHit()) {
                    hitPoints.push({point: [hitPoint[0], hitPoint[1]], body: result.body});
                }
            }
        });
        var result = new p2.RaycastResult();
        this.p2World.raycast(result, ray);
        return hitPoints;
    }

    groupSegments(segments){
        var thisSegment, next, dist,
            rays = [], segmentGroups = [], thisGroup = [],
            tolerance = Math.sqrt(this.bbox.height * this.bbox.width) * (1 / this.landArea);

        var addSegments = () => {

            var startNewGroup = () => {
                if(thisGroup.length > 0)
                    segmentGroups.push(thisGroup);
                thisGroup = [];
            };

            thisSegment = segments.shift();

            //stop case if segments is already empty
            if(thisSegment === undefined)
                return startNewGroup();

            //exclude any bodies that should be excluded
            //if the first segment point is excluded we should always exclude that segment regardless of the 2nd
            if(thisSegment[0].body.excluded){
                startNewGroup();
                return addSegments();
            }

            thisGroup.push(thisSegment);
            next = segments[0];

            //stop case if there is no next element to measure distance/tolerance calculations
            if (next === undefined)
                return startNewGroup();

            dist = this.getDist(thisSegment[1].point, next[0].point);

            if (dist > tolerance){
                //if the next segment is greater than the allowed tolerance,
                //end this group and start the next
                startNewGroup();
            }

            return addSegments();
        };

        addSegments();

        segmentGroups.forEach((group) => {
            const points = [];
            group.forEach((seg) => {
                points.push(seg[0], seg[1]);
            });
            const ray = this.rayFromHitPoints(points);
            if (ray) {
                rays.push(ray);
            }
        });

        return rays;
    }

    computeRay(start, end){

        var axis = (start[0] === end[0])? 1 : 0;
        var hitPoints = this.getHitPoints(start, end);

        //if total hitpoints returned is not even, what's happened is that the projected ray coincides (possibly
        //more than once) with the shape border. This will throw up all kinds of undesired collisions; as such, we
        //are unable to process the hit-point data accurately and we consider this ray a fail.

        if (hitPoints.length == 0 || (hitPoints.length % 2) != 0)
            return false;

        var sortedHitPoints = sortBy(hitPoints, [(hp) => {return(hp.point[axis])}]);
        var rays, longestRay, segments = [];

        for(var i=0; i < sortedHitPoints.length; i += 2){
            var segmentStart = sortedHitPoints[i];
            var segmentEnd = sortedHitPoints[i + 1];
            segments.push([segmentStart,segmentEnd]);
        }

        if (segments.length === 1){
            return [segments[0][0].point, segments[0][1].point];
        }

        rays = this.groupSegments(segments);

        longestRay = maxBy(rays, (p) => {
            return this.getDist(p[0].point, p[1].point);
        });

        return [longestRay[0].point, longestRay[1].point];
    }

    pointInside(_p){
        var match = null;

        this.polygons.forEach((poly) => {
            poly.forEach((shape, idx) => {
                if (pip(_p, shape)) {
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

    //absolute points to relative
    translate(point, center, slope){
        var angle = -Math.atan(slope);

        var translated = [];

        translated.push(point[0] - center[0]);
        translated.push(point[1] - center[1]);

        var rotated = this.rotateAroundPoint(translated, angle);
        rotated[0] = (slope < 0)? -rotated[0] : rotated[0];

        return rotated;
    };

    //relative points to absolute
    untranslate(point, center, slope){

        var x1 = (slope < 0)? -point[0] : point[0];
        var y1 = point[1];
        var angle = Math.atan(slope);

        var rotated = this.rotateAroundPoint([x1, y1], angle);
        var translated = [];

        translated.push(rotated[0] + center[0]);
        translated.push(rotated[1] + center[1]);

        return translated;
    };

    rotateAroundPoint(point, angle) {
        var x1 = point[0], y1 = point[1];

        var x2 = x1 * Math.cos(angle) - y1 * Math.sin(angle);
        var y2 = x1 * Math.sin(angle) + y1 * Math.cos(angle);

        return [x2, y2];
    }

    newLine (slope, yIntercept, flipped) {
        var otherMin, otherMax, lineStart, lineEnd;
        if (Math.abs(slope) === Infinity){
            lineStart = [yIntercept, this.bbox.minY];
            lineEnd = [yIntercept, this.bbox.maxY];
        } else {
            if (!flipped) {
                otherMin = slope * this.bbox.minX + yIntercept;
                otherMax = slope * this.bbox.maxX + yIntercept;
                lineStart = [this.bbox.minX, otherMin];
                lineEnd = [this.bbox.maxX, otherMax];
            } else {
                otherMin = slope * this.bbox.minY + yIntercept;
                otherMax = slope * this.bbox.maxY + yIntercept;
                lineStart = [otherMin, this.bbox.minY];
                lineEnd = [otherMax, this.bbox.maxY];
            }
        }
        return {start: lineStart, end: lineEnd}
    }

    regressionLines (slope, yIntercept, flipped){
        const linesPerAxis = 10;
        const offset = (!flipped)? this.bbox.height / linesPerAxis : this.bbox.width / linesPerAxis;
        const lines = [];

        const lineLoop = (offset, yInt) => {
            yInt += offset;
            var line = this.newLine(slope, yInt, flipped);
            if (pip(line.start, this.bbox.points) || pip(line.end, this.bbox.points)){
                lines.push(line);
                lineLoop(offset, yInt);
            }
        };

        lines.push( this.newLine(slope, yIntercept, flipped) );
        lineLoop(offset, yIntercept);
        lineLoop(-offset, yIntercept);
        return lines;
    }

    addPerpendicularRelativeMidPoint(start, end, offset){
        var ray = this.computeRay(start, end);
        if (!ray) return false;
        var midPoint = this.getMidPoint(ray[0], ray[1]);

        var relativeX = this.getDist(offset, this.ray.center);
        var relativeY = this.getDist(midPoint, offset);

        var roundSigFigs = (n) => {
            var sigFigs = 10000;
            return Math.floor(Math.round(n*sigFigs)) / sigFigs;
        }

        var doInvert = (slope, intercept, start, end, axis) => {
            return (Math.abs(slope) === Infinity && roundSigFigs(end[axis] - start[axis]) <= 0) || //special case for Infinity slope
                (midPoint[1] < ((slope * midPoint[0]) + intercept)); //linear inequality y < mx + b, plugging in midpoint
        };

        if( doInvert(this.longestLine.pslope, this.longestLine.pintercept, offset, this.ray.center, 0) ){
            relativeX = relativeX * -1; //assign directionality
        }

        if( doInvert(this.longestLine.slope, this.longestLine.intercept, midPoint, offset,1) ){
            relativeY = relativeY * -1;
        }

        var relativeMidPoint = [ relativeX, relativeY ];
        this.relativeMidPoints.push(relativeMidPoint);

        this.midPointRays.push([ray[0], ray[1]]);

        return relativeMidPoint;
    }

    findMidPoint (slope, offset){
        const tryOffset = (_o) => {
            var line, intercept;
            if (Math.abs(slope) === Infinity)
                intercept = _o[0];
            else
                intercept = _o[1] - slope * _o[0];
            line = this.newLine(slope, intercept);
            return this.addPerpendicularRelativeMidPoint(line.start, line.end, _o);
        }

        var segments = 50;
        var segAxis = (Math.abs(this.longestLine.slope) === Infinity)? 1 : 0;
        var segLength = (Math.abs(this.ray.end[segAxis] - this.ray.start[segAxis]) / segments);
        for(var i = 0; i <= segments; i++){
            var validMidpoint;

            [1, -1].forEach( (polarity) => {
                if(validMidpoint)
                    return;

                if(Math.abs(this.longestLine.slope) === Infinity){
                    validMidpoint = tryOffset([
                        offset[0],
                        offset[1] + (i * segLength) * polarity,
                    ]);

                }else if(Math.abs(this.longestLine.slope) == 0){
                    validMidpoint = tryOffset([
                        offset[0] + (i * segLength) * polarity,
                        offset[1],
                    ]);
                }else{
                    validMidpoint = tryOffset([
                        offset[0] + (i * segLength) * polarity,
                        offset[1] + (i * segLength * this.longestLine.slope) * polarity,
                    ]);
                }
            });


            if(validMidpoint)
                return validMidpoint;
        }

        return false;
    }

    getTextWidth(font){
        this.worldCtx.font = font + 'px sans-serif';
        return this.worldCtx.measureText(this.rawData.label).width;
    }

    placeLetters (start){

        this.worldCtx.font = this.fontSize + 'px sans-serif';

        var lettersWithPoints = [];
        var letterPadding = this.worldCtx.measureText(" ").width / 4;
        var nextPoint = start;

        this.letters.forEach( (letter) => {
            var letterWidth = this.worldCtx.measureText(letter).width + letterPadding;
            lettersWithPoints.push({letter: letter, point: nextPoint, width: letterWidth});
            var letterDistance = (this.reverseLetters)? - letterWidth : letterWidth;
            var nextPointX = arcSolver(this.relativeSplineEquation[2], this.relativeSplineEquation[1], nextPoint[0], letterDistance);
            var nextPointY = this.relativeSplineEquation[2] * Math.pow(nextPointX, 2) + this.relativeSplineEquation[1] * nextPointX + this.relativeSplineEquation[0];
            nextPoint = [nextPointX, nextPointY];
        });
        return lettersWithPoints;
    }

    getExtremePoint(direction){
        var delta = (direction == 'first')? -1 : 1;
        var segments = 50;
        var segLength = (this.ray.length / segments);

        var getPoint = (index) => {
            var x = index * segLength;
            var y = this.relativeSplineEquation[2] * Math.pow(x, 2) + this.relativeSplineEquation[1] * x + this.relativeSplineEquation[0];
            var p = this.untranslate([x, y], this.ray.center, this.longestLine.slope);
            return {absolute: p, relative: [x, y]}
        };

        var inPoint;
        var outPoint;
        var thisPoint;

        range(0, segments).forEach((i) => {
            thisPoint = getPoint(i * delta);
            var match = this.pointInside(thisPoint.absolute);

            if(!match){
                if(inPoint)
                    outPoint = thisPoint;
            }else{
                inPoint = thisPoint;
            }
        });


        if(inPoint && outPoint){
            var p = this.getHitPoints(inPoint.absolute, outPoint.absolute)[0].point;
            var t = this.translate(p, this.ray.center, this.longestLine.slope);
            return { absolute: p, relative: t};
        }else return getPoint((segments / 2) * delta);

    };

    addDataToPhysicsWorld(){
        this.rawData.shapes.forEach( (shape) => {
            shape.vertices.forEach( (poly, idx) => {
                var body = new p2.Body();
                var convex;
                if(idx == 0){
                    convex = new p2.Convex({ vertices: poly });
                    this.shapesArea += this.calcPolygonArea(poly);
                }else{
                    //add the shape's 'holes'.
                    convex = new p2.Convex({ vertices: poly.slice().reverse() });
                    this.shapesArea -= this.calcPolygonArea(poly);
                    if(this.excludeHoles)
                        body.excluded = true;
                }

                if(shape.excluded)
                    body.excluded = true;

                body.addShape(convex);
                this.p2World.addBody(body);
            });
        });
    }

    calculateLetters() {

        this.addDataToPhysicsWorld();

        const totalLandArea = this.shapesArea / (this.totalBbox.width * this.totalBbox.height);

        if(totalLandArea <= 0.0001){
            this.systemOmitted = true;
            return false;
        }

        this.landArea = this.shapesArea / (this.bbox.width * this.bbox.height);

        const linearDataXY = [];
        const linearDataYX = [];

        //get a list of all points (with some offset) inside all shapes used for least squares regression
        const bboxDivisions = 50;

        range(this.bbox.minX, this.bbox.maxX + 1, (this.bbox.width + 1) / bboxDivisions).forEach( (x) => {
            range(this.bbox.minY, this.bbox.maxY + 1, (this.bbox.height + 1) / bboxDivisions).forEach((y) => {
                var p = [x,y];
                if(this.pointInside(p))
                    linearDataXY.push(p);
            });
        });

        linearDataXY.forEach((p)=>{
            linearDataYX.push([p[1], p[0]]);
        });

        let regX = regression('linear', linearDataXY);
        let regY = regression('linear', linearDataYX);
        const lines = this.regressionLines(regX.equation[0], regX.equation[1]).concat( this.regressionLines(regY.equation[0], regY.equation[1], true) );
        const validRays = [];
        lines.forEach((line)=>{
            var ray = this.computeRay(line.start, line.end);
            if (ray) validRays.push(ray);
        });

        const longestRay = maxBy(validRays, (ray) => {
            return this.getDist(ray[0], ray[1]);
        });

        this.ray.start = longestRay[0];
        this.ray.end = longestRay[1];
        this.ray.center = this.getMidPoint(this.ray.start,this.ray.end);
        this.ray.length = this.getDist(this.ray.start, this.ray.end);

        const rayOffsets = [];

        rayOffsets.push( this.getMidPoint(this.ray.start, this.ray.center));
        rayOffsets.push(this.ray.center);
        rayOffsets.push( this.getMidPoint(this.ray.center, this.ray.end));

        this.longestLine.slope = this.getSlope(this.ray.start, this.ray.end);

        if(Math.abs(this.longestLine.slope) == Infinity &&
            this.ray.center[0] > (this.bbox.minX + this.bbox.width / 2)){
            this.longestLine.slope *= -1;
        }

        this.longestLine.angle = Math.atan(this.longestLine.slope);
        this.longestLine.intercept = this.ray.center[1] - this.longestLine.slope * this.ray.center[0];
        this.longestLine.pslope = -1 / this.longestLine.slope;
        this.longestLine.pintercept = this.ray.center[1] - (-1/this.longestLine.slope) * this.ray.center[0];

        rayOffsets.forEach((offset) => {
            this.findMidPoint(this.longestLine.pslope, offset);
        });

        this.spline = regression('polynomial', this.relativeMidPoints, 2);
        this.relativeSplineEquation = this.spline.equation;

        this.boundaryPoints.first = this.getExtremePoint('first');
        this.boundaryPoints.last = this.getExtremePoint('last');

        if (this.longestLine.slope < 0){
            this.reverseLetters = true;
            this.boundaryPoints.last = [this.boundaryPoints.first, this.boundaryPoints.first = this.boundaryPoints.last][0]; //swap first and last point
        }

        const curveLength = Math.abs((() => {
            var a = this.relativeSplineEquation[2];
            var b = this.relativeSplineEquation[1];

            if(a == 0){
                return this.getDist(this.boundaryPoints.last.relative, this.boundaryPoints.first.relative);
            }

            var eachPoint = (p) => {
                var x = p[0];
                var ddx = (2*a*x + b);
                return (
                    (
                        ddx *
                        Math.sqrt(1 + Math.pow(ddx, 2))
                    ) +
                    Math.asinh(ddx)
                ) / (4*a);
            };

            return (eachPoint(this.boundaryPoints.last.relative) - eachPoint(this.boundaryPoints.first.relative));
        })());

        var desiredTextWidth = curveLength * 0.8;

        //calculate font-size vs total text-width ratio
        var fontSizeSlope = (this.getTextWidth(20) - this.getTextWidth(10)) / 10;

        //simple solving "y = mx + b" for x where b = 0, fontSizeSlope = m, fontSize = x
        this.fontSize = desiredTextWidth / fontSizeSlope;

        let letterPoints = this.placeLetters(this.boundaryPoints.first.relative);
        let distFromLast = this.getDist(letterPoints[letterPoints.length - 1].point, this.boundaryPoints.last.relative);
        distFromLast -= this.worldCtx.measureText(this.rawData.label[this.rawData.label.length - 1]).width;
        if (this.longestLine.slope < 0) distFromLast *= -1;

        const labelStartX = arcSolver(this.relativeSplineEquation[2], this.relativeSplineEquation[1], this.boundaryPoints.first.relative[0], distFromLast/2);
        const labelStartY = this.relativeSplineEquation[2] * Math.pow(labelStartX, 2) + this.relativeSplineEquation[1] * labelStartX + this.relativeSplineEquation[0];

        letterPoints = this.placeLetters([labelStartX,labelStartY]);

        letterPoints.forEach((obj) => {
            var point = obj.point;
            if (!point) return;
            var halfLetter = this.worldCtx.measureText(obj.letter).width / 2;
            var middlePoint = (this.longestLine.slope > 0)? point[0] + halfLetter : point[0] - halfLetter;
            var slope = 2 * this.relativeSplineEquation[2] * middlePoint + this.relativeSplineEquation[1];
            var angle = Math.atan(slope);
            if (this.longestLine.slope < 0)
                angle *= -1;
            angle += this.longestLine.angle;
            var perpSlope = this.getPerpendicularSlope(slope);
            var perpAngle = Math.atan(perpSlope);
            var dist = this.fontSize / 4;
            if (perpSlope < 0) dist *= -1;
            var x = point[0] + dist * Math.cos(perpAngle);
            var y = point[1] + dist * Math.sin(perpAngle);
            var absolutePoint = this.untranslate([x,y], this.ray.center, this.longestLine.slope);

            this.letterData.push({letter: obj.letter, width: obj.width, angle: angle, point: absolutePoint});
        });
    };

    isOmitted () {
        return this.systemOmitted;
    };

    getSplineData(){

        return {
            spline: this.spline,
            firstPoint: this.boundaryPoints.first,
            lastPoint: this.boundaryPoints.last,
            relativeMidPoints: this.relativeMidPoints,
            midPointRays: this.midPointRays,
            longestRay: {
                start: this.ray.start,
                end: this.ray.end,
                center: this.ray.center,
                length: this.ray.length,
                slope: this.longestLine.slope,
                angle: this.longestLine.angle,
                intercept: this.longestLine.intercept,
                pslope: this.longestLine.pslope,
                pintercept: this.longestLine.pintercept
            }
        };
    };

    getLabelData(){
        return {letters: this.letterData, fontSize: this.fontSize};
    };


    getVertices(){
        return this.polygons;
    };

    drawGeometry(){

        const canvas = spawnCanvas([this.worldCanvas.width, this.worldCanvas.height]);
        const ctx = canvas.getContext('2d');

        this.rawData.shapes.forEach((poly) => {

            ctx.fillStyle = (poly.excluded)? "#777" : "#CCC";
            ctx.strokeStyle = "#000";
            ctx.beginPath();

            poly.vertices.forEach((shape) => {
                shape.forEach((vtx, v_idx) => {
                    if(v_idx == 0)
                        ctx.moveTo(vtx[0], vtx[1]);
                    else
                        ctx.lineTo(vtx[0], vtx[1]);
                });
                ctx.closePath();
            });

            ctx.stroke();
            ctx.fill();
        });

        return canvas;
    };

    debugDraw (options) {
        if(options === undefined)
            options = {};

        const canvas = spawnCanvas([this.worldCanvas.width, this.worldCanvas.height]);

        if(this.systemOmitted)
            return canvas;

        const ctx = canvas.getContext('2d');

        const _s = this.getSplineData();

        const numPerpSegments = 20;
        const l = _s.lastPoint.relative[0] - _s.firstPoint.relative[0];
        const raySegment = -l / numPerpSegments;

        const splineEquation = _s.spline.equation;


        if(options.drawLetterPlacement === true){
            //draw per-letter placement data
            let labelData = this.getLabelData();
            ctx.strokeStyle = "#80F";
            ctx.fillStyle = "#80F";
            ctx.lineWidth = 1;
            labelData.letters.forEach((obj) => {
                ctx.save();
                ctx.translate(obj.point[0], obj.point[1]);
                ctx.rotate(obj.angle);
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -labelData.fontSize);
                ctx.lineTo(obj.width, -labelData.fontSize);
                ctx.lineTo(obj.width, 0);
                ctx.lineTo(0, 0);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(obj.width / 2, 0, 3, 2 * Math.PI, 0);
                ctx.closePath();
                ctx.fill();

                ctx.restore();
            });
        }

        ctx.strokeStyle = "#0F0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for(let i = 0; i <= numPerpSegments; i++){
            let x = _s.lastPoint.relative[0] + i * raySegment;
            let y = splineEquation[2] * Math.pow(x,2) + splineEquation[1] * x + splineEquation[0];
            let p = this.untranslate([x,y], _s.longestRay.center, _s.longestRay.slope);
            if(i == 0){
                ctx.moveTo(p[0], p[1]);
            }else{
                ctx.lineTo(p[0], p[1]);
            }
        }
        ctx.stroke();

        ctx.strokeStyle = "#0FF";
        ctx.beginPath();
        let _p = _s.longestRay.start;
        ctx.moveTo(_p[0], _p[1]);
        _p = _s.longestRay.end;
        ctx.lineTo(_p[0], _p[1]);
        ctx.stroke();

        ctx.strokeStyle = "#F0C";
        ctx.fillStyle = '#F0C';
        ctx.lineWidth = 2;
        _s.midPointRays.forEach( (ray) => {
            ctx.beginPath();
            ctx.moveTo(ray[0][0], ray[0][1]);
            ctx.lineTo(ray[1][0], ray[1][1]);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ray[0][0], ray[0][1], 3, 2 * Math.PI, 0);
            ctx.arc(ray[1][0], ray[1][1], 3, 2 * Math.PI, 0);
            ctx.closePath();
            ctx.fill();
        });


        //draw spline entry/exit points

        var points = ['firstPoint', 'lastPoint'].map((_k) => {
            var p = _s[_k].absolute ;
            return p;
        }).concat(this.relativeMidPoints.map((p) => {
            return this.untranslate(p, this.ray.center, this.longestLine.slope);
        }));

        points.forEach((p, idx) => {
            ctx.beginPath();
            ctx.arc(p[0], p[1], 5, 2 * Math.PI, 0);
            ctx.closePath();

            switch(idx){
                case 0:
                    ctx.fillStyle = '#F00';
                    break;
                case 1:
                    ctx.fillStyle = '#00F';
                    break;
                default:
                    ctx.fillStyle = '#0F0';
                    break;
            }

            ctx.fill();
        });

        return canvas;
    };

    //returns a canvas with dimensions specified in dims, with only the finished label drawn.
    //makes it so that this library can easily be used on the server-side to pre-generate loads of labels
    //for future use...
    drawLabel(){

        var canvas = spawnCanvas([this.worldCanvas.width, this.worldCanvas.height]);
        if(this.systemOmitted)
            return canvas;
        var ctx = canvas.getContext('2d');

        var labelData = this.getLabelData();
        ctx.save();
        labelData.letters.forEach((obj) => {
            var letterDims = [obj.width, labelData.fontSize + labelData.fontSize * 0.5];
            var letterCanvas = spawnCanvas(letterDims);
            var letterCtx = letterCanvas.getContext('2d');
            letterCtx.font = labelData.fontSize + 'px sans-serif';
            letterCtx.fillStyle = "#000";
            letterCtx.fillText(obj.letter, 0, labelData.fontSize);

            ctx.save();
            ctx.translate(obj.point[0], obj.point[1]);
            ctx.rotate(obj.angle);
            ctx.drawImage(letterCanvas, 0, -labelData.fontSize);
            ctx.restore();

        });

        ctx.restore();

        return canvas;
    };
};