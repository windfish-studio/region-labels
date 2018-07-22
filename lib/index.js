'use strict';

var _ = require("lodash");
var p2 = require("p2");
var pip = require("point-in-polygon");
var regression = require("regression");
var arcSolver = require("./parabolic_arclength_solver");

function calcPolygonArea(vertices) {
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

function rayFromHitPoints(hitPoints){
    if (hitPoints.length < 2)
        return false;
    var axis = (hitPoints[0].point[0] === hitPoints[1].point[0])? 1 : 0;
    var min =_.minBy(hitPoints, function(hp){
        return hp.point[axis]
    });
    var max =_.maxBy(hitPoints, function(hp){
        return hp.point[axis]
    });
    return [min, max];
}

function getDist(start, end){
    var distX = end[0] - start[0];
    var distY = end[1] - start[1];
    return Math.sqrt( distX*distX + distY*distY );
}

function getSlope(start, end){
    return (end[1] - start[1]) / (end[0] - start[0])
}

function getPerpendicularSlope(slope){
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

function getMidPoint(start, end){
    return [(end[0] + start[0]) / 2, (end[1] + start[1]) / 2];
}

function isServer(){
    return (typeof document == 'undefined');
}

function spawnCanvas(dims) {
    var canvas;
    if(isServer()){
        var pkgName = 'canvas';
        var Canvas = require(pkgName); //so that this won't be parsed by browserify
        canvas = new Canvas(Math.ceil(dims[0]), Math.ceil(dims[1]));
    }else{
        var canvas = document.createElement('canvas');
        canvas.width = Math.ceil(dims[0]);
        canvas.height = Math.ceil(dims[1]);
    }

    return canvas;
};

function iterateVertices(feature, iter){
    switch(feature.geometry.type){
        case 'MultiPolygon':
            _.each(feature.geometry.coordinates, function (_v, _i) {
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

function RegionLabel(geojson, opts) {

    //constructor logic
    opts = opts || {};
    opts.canvasDims = opts.canvasDims || [256, 256];
    opts.label = opts.label || function (_props) { return _props.NAME; };
    opts.excludeFeatures = opts.excludeFeatures || function () { return false; };
    opts.excludeHoles = (opts.excludeHoles === undefined)? true : opts.excludeHoles;
    opts.wrapLongitude = (opts.wrapLongitude === undefined)? true : opts.wrapLongitude;
    opts.wrapLongitudeTolerance = (opts.wrapLongitudeTolerance === undefined)? 180 : opts.wrapLongitudeTolerance;

    var margin = opts.margin || 0,
        world_canvas = opts.canvas || spawnCanvas(opts.canvasDims),
        groupData = [],
        labelGroups = [],
        ctx = world_canvas.getContext('2d'),
        totalBbox = null;

    parseGeoJSON(geojson);
    centerVertices(world_canvas);
    calculateGroupLabels();

    function parseGeoJSON() {
        var _g = geojson;
        groupData = [];

        //parse GeoJSON
        var aggregateFeature = function(_f, group){

            if(opts.wrapLongitude){
                RegionLabel.doWrapLongitude(_f, opts.wrapLongitudeTolerance);
            }

            var excluded = opts.excludeFeatures(_f.properties);
            iterateVertices(_f, function (verts) {
                group.shapes.push({
                    excluded: excluded,
                    vertices: verts
                });
            });

        };

        var singleGroup = (typeof opts.label != 'function');

        var group;
        if(singleGroup){
            group = {'shapes': [], 'label': opts.label};
            groupData.push(group);
        }

        if(_g.type && _g.type == 'FeatureCollection'){

            _.each(_g.features, function (feat) {
                if(!singleGroup){
                    //make a new group for each feature
                    group = {'shapes': [], 'label': opts.label(feat.properties)};
                    groupData.push(group);
                }
                aggregateFeature(feat, group);
            });
        }else{
            aggregateFeature(_g, group); //geojson is a feature;
        }
    }

    function centerVertices(canvas) {

        var pixelWidth, pixelHeight, pixelRatio, hRatio, vRatio;
        var canvasDims = [];

        canvasDims.push(canvas.width - margin);
        canvasDims.push(canvas.height - margin);

        var newVertex = function(coords){
            return [
                ((vRatio == pixelRatio)? (canvasDims[0] / 2 - pixelWidth / 2) : 0) + margin/2 + pixelRatio * (coords[0] - totalBbox.minX),
                ((hRatio == pixelRatio)? (canvasDims[1] / 2 - pixelHeight / 2) : 0) + margin/2 + -pixelRatio * (coords[1] - totalBbox.maxY)
            ];
        };

        var regenerateBbox = function () {
            totalBbox = RegionLabel.generateBoundingBox(_.map(groupData, function (l_group) {
                return _.map(l_group.shapes, function (p_obj) {
                    return p_obj.vertices;
                });
            }));
        };

        regenerateBbox();

        hRatio = canvasDims[0] / totalBbox.width;
        vRatio = canvasDims[1] / totalBbox.height;

        pixelRatio = Math.min ( hRatio, vRatio );
        pixelWidth = pixelRatio * totalBbox.width;
        pixelHeight = pixelRatio * totalBbox.height;

        //turn geo coords into screen coords

        _.each(groupData, function (l_group) {
            var newPolys = [];
            _.each(l_group.shapes, function (p_obj) {
                var newPoly = [];
                _.each(p_obj.vertices, function (shape) {
                    var shapeVertices = [];

                    _.each(shape, function (vtx) {
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

    function calculateGroupLabels(){
        _.each(groupData, function (g_data) {
            labelGroups.push(new LabelGroup(g_data));
        });
    };

    function LabelGroup(data){

        var regX, regY, lines, spline, relativeSplineEquation, landArea, fontSize, reverseLetters, textWidth, firstPoint, lastPoint,
            letterPoints, distFromLast, labelStartX, labelStartY, rayStart, rayEnd, rayCenter, rayLength, curveLength,
            longestLineSlope,longestLineAngle, longestLineIntercept, longestLinePSlope, longestLinePIntercept, longestRay,
            rayOffsets = [], validRays = [], relativeMidPoints = [], linearDataXY = [], linearDataYX = [], letterData = [],
            midPointRays = [],
            shapesArea = 0,
            systemOmitted = false,
            world = new p2.World(),
            letters = data.label.split(""),
            polygons = _.map(data.shapes, function (p_obj) { return p_obj.vertices });

        var bbox = RegionLabel.generateBoundingBox([polygons]);

        calculateLetters();

        function getHitPoints(start, end){
            var hitPoints = [];
            var ray = new p2.Ray({
                mode: p2.Ray.ALL,
                from: start,
                to: end,
                callback: function (result) {
                    var hitPoint = p2.vec2.create();
                    result.getHitPoint(hitPoint, ray);
                    if (result.hasHit()) {
                        hitPoints.push({point: [hitPoint[0], hitPoint[1]], body: result.body});
                    }
                }
            });
            var result = new p2.RaycastResult();
            world.raycast(result, ray);
            return hitPoints;
        }

        function groupSegments(segments){
            var thisSegment, next, dist,
                rays = [], segmentGroups = [], thisGroup = [],
                tolerance = Math.sqrt(bbox.height * bbox.width) * (1 / landArea);

            var addSegments = function(){

                var startNewGroup = function(){
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

                dist = getDist(thisSegment[1].point, next[0].point);

                if (dist > tolerance){
                    //if the next segment is greater than the allowed tolerance,
                    //end this group and start the next
                    startNewGroup();
                }

                return addSegments();
            };

            addSegments();

            _.each(segmentGroups, function(group){
                var points = [];
                _.each(group, function(seg){
                    points.push(seg[0], seg[1]);
                });
                var ray = rayFromHitPoints(points);
                if (ray) {
                    rays.push(ray);
                }
            });

            return rays;
        }

        function computeRay(start, end){

            var axis = (start[0] === end[0])? 1 : 0;
            var hitPoints = getHitPoints(start, end);

            //if total hitpoints returned is not even, what's happened is that the projected ray coincides (possibly
            //more than once) with the shape border. This will throw up all kinds of undesired collisions; as such, we
            //are unable to process the hit-point data accurately and we consider this ray a fail.

            if (hitPoints.length == 0 || (hitPoints.length % 2) != 0)
                return false;

            var sortedHitPoints = _.sortBy(hitPoints, [function(hp){return(hp.point[axis])}]);
            var rays, longestRay, segments = [];

            for(var i=0; i < sortedHitPoints.length; i += 2){
                var segmentStart = sortedHitPoints[i];
                var segmentEnd = sortedHitPoints[i + 1];
                segments.push([segmentStart,segmentEnd]);
            }

            if (segments.length === 1){
                return [segments[0][0].point, segments[0][1].point];
            }

            rays = groupSegments(segments);

            longestRay = _.maxBy(rays, function(p){
                return getDist(p[0].point, p[1].point);
            });

            return [longestRay[0].point, longestRay[1].point];
        }

        function pointInside(_p){
            var match = null;

            _.each(polygons, function (poly) {
                _.each(poly, function (shape, idx) {
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
        function translate(point, center, slope){
            var angle = -Math.atan(slope);

            var translated = [];

            translated.push(point[0] - center[0]);
            translated.push(point[1] - center[1]);

            var rotated = rotateAroundPoint(translated, angle);
            rotated[0] = (slope < 0)? -rotated[0] : rotated[0];

            return rotated;
        };

        //relative points to absolute
        function untranslate(point, center, slope){

            var x1 = (slope < 0)? -point[0] : point[0];
            var y1 = point[1];
            var angle = Math.atan(slope);

            var rotated = rotateAroundPoint([x1, y1], angle);
            var translated = [];

            translated.push(rotated[0] + center[0]);
            translated.push(rotated[1] + center[1]);

            return translated;
        };

        function rotateAroundPoint(point, angle) {
            var x1 = point[0], y1 = point[1];

            var x2 = x1 * Math.cos(angle) - y1 * Math.sin(angle);
            var y2 = x1 * Math.sin(angle) + y1 * Math.cos(angle);

            return [x2, y2];
        }

        function newLine (slope, yIntercept, flipped) {
            var otherMin, otherMax, lineStart, lineEnd;
            if (Math.abs(slope) === Infinity){
                lineStart = [yIntercept, bbox.minY];
                lineEnd = [yIntercept, bbox.maxY];
            } else {
                if (!flipped) {
                    otherMin = slope * bbox.minX + yIntercept;
                    otherMax = slope * bbox.maxX + yIntercept;
                    lineStart = [bbox.minX, otherMin];
                    lineEnd = [bbox.maxX, otherMax];
                } else {
                    otherMin = slope * bbox.minY + yIntercept;
                    otherMax = slope * bbox.maxY + yIntercept;
                    lineStart = [otherMin, bbox.minY];
                    lineEnd = [otherMax, bbox.maxY];
                }
            }
            return {start: lineStart, end: lineEnd}
        }

        function regressionLines (slope, yIntercept, flipped){
            var linesPerAxis = 10;
            var offset = (!flipped)? bbox.height / linesPerAxis : bbox.width / linesPerAxis;
            var lines = [];

            function lineLoop(offset, yInt){
                yInt += offset;
                var line = newLine(slope, yInt, flipped);
                if (pip(line.start, bbox.points) || pip(line.end, bbox.points)){
                    lines.push(line);
                    lineLoop(offset, yInt);
                }
            }
            lines.push( newLine(slope, yIntercept, flipped) );
            lineLoop(offset, yIntercept);
            lineLoop(-offset, yIntercept);
            return lines;
        }

        function addPerpendicularRelativeMidPoint(start, end, offset){
            var ray = computeRay(start, end);
            if (!ray) return false;
            var midPoint = getMidPoint(ray[0], ray[1]);

            var relativeX = getDist(offset, rayCenter);
            var relativeY = getDist(midPoint, offset);

            var roundSigFigs = function (n) {
                var sigFigs = 10000;
                return Math.floor(Math.round(n*sigFigs)) / sigFigs;
            }

            var doInvert = function(slope, intercept, start, end, axis){
                return (Math.abs(slope) === Infinity && roundSigFigs(end[axis] - start[axis]) <= 0) || //special case for Infinity slope
                    (midPoint[1] < ((slope * midPoint[0]) + intercept)); //linear inequality y < mx + b, plugging in midpoint
            };

            if( doInvert(longestLinePSlope, longestLinePIntercept, offset, rayCenter, 0) ){
                relativeX = relativeX * -1; //assign directionality
            }

            if( doInvert(longestLineSlope, longestLineIntercept, midPoint, offset,1) ){
                relativeY = relativeY * -1;
            }

            var relativeMidPoint = [ relativeX, relativeY ];
            relativeMidPoints.push(relativeMidPoint);

            midPointRays.push([ray[0], ray[1]]);

            return relativeMidPoint;
        }

        function findMidPoint (slope, offset){
            function tryOffset(_o){
                var line, intercept;
                if (Math.abs(slope) === Infinity)
                    intercept = _o[0];
                else
                    intercept = _o[1] - slope * _o[0];
                line = newLine(slope, intercept);
                return addPerpendicularRelativeMidPoint(line.start, line.end, _o);
            }

            var segments = 50;
            var segAxis = (Math.abs(longestLineSlope) === Infinity)? 1 : 0;
            var segLength = (Math.abs(rayEnd[segAxis] - rayStart[segAxis]) / segments);
            for(var i = 0; i <= segments; i++){
                var validMidpoint;

                _.each([1, -1], function (polarity) {
                    if(validMidpoint)
                        return;

                    if(Math.abs(longestLineSlope) === Infinity){
                        validMidpoint = tryOffset([
                            offset[0],
                            offset[1] + (i * segLength) * polarity,
                        ]);

                    }else if(Math.abs(longestLineSlope) == 0){
                        validMidpoint = tryOffset([
                            offset[0] + (i * segLength) * polarity,
                            offset[1],
                        ]);
                    }else{
                        validMidpoint = tryOffset([
                            offset[0] + (i * segLength) * polarity,
                            offset[1] + (i * segLength * longestLineSlope) * polarity,
                        ]);
                    }
                });


                if(validMidpoint)
                    return validMidpoint;
            }

            return false;
        }

        function getTextWidth(font){
            ctx.font = font + 'px sans-serif';
            return ctx.measureText(data.label).width;
        }
        function placeLetters (start){

            var lettersWithPoints = [];
            var letterPadding = ctx.measureText(" ").width / 4;
            var nextPoint = start;

            _.each(letters, function(letter) {
                var letterWidth = ctx.measureText(letter).width + letterPadding;
                lettersWithPoints.push({letter: letter, point: nextPoint, width: letterWidth});
                var letterDistance = (reverseLetters)? - letterWidth : letterWidth;
                var nextPointX = arcSolver(relativeSplineEquation[2], relativeSplineEquation[1], nextPoint[0], letterDistance);
                var nextPointY = relativeSplineEquation[2] * Math.pow(nextPointX, 2) + relativeSplineEquation[1] * nextPointX + relativeSplineEquation[0];
                nextPoint = [nextPointX, nextPointY];
            });
            return lettersWithPoints;
        }

        function getExtremePoint(direction){
            var delta = (direction == 'first')? -1 : 1;
            var segments = 50;
            var segLength = (rayLength / segments);

            var getPoint = function(index){
                var x = index * segLength;
                var y = relativeSplineEquation[2] * Math.pow(x, 2) + relativeSplineEquation[1] * x + relativeSplineEquation[0];
                var p = untranslate([x, y], rayCenter, longestLineSlope);
                return {absolute: p, relative: [x, y]}
            };

            var inPoint;
            var outPoint;
            var thisPoint;

            _.each(_.range(0, segments), function(i){
                thisPoint = getPoint(i * delta);
                var match = pointInside(thisPoint.absolute);

                if(!match){
                    if(inPoint)
                        outPoint = thisPoint;
                }else{
                    inPoint = thisPoint;
                }
            });


            if(inPoint && outPoint){
                var p = getHitPoints(inPoint.absolute, outPoint.absolute)[0].point;
                var t = translate(p, rayCenter, longestLineSlope);
                return { absolute: p, relative: t};
            }else return getPoint((segments / 2) * delta);

        };

        function addDataToPhysicsWorld(){
            _.each(data.shapes, function(shape){
                _.each(shape.vertices, function (poly, idx) {
                    var body = new p2.Body();
                    var convex;
                    if(idx == 0){
                        convex = new p2.Convex({ vertices: poly });
                        shapesArea += calcPolygonArea(poly);
                    }else{
                        //add the shape's 'holes'.
                        convex = new p2.Convex({ vertices: _.reverse(_.clone(poly)) });
                        shapesArea -= calcPolygonArea(poly);
                        if(opts.excludeHoles)
                            body.excluded = true;
                    }

                    if(shape.excluded)
                        body.excluded = true;

                    body.addShape(convex);
                    world.addBody(body);
                });
            });
        }

        function calculateLetters() {

            addDataToPhysicsWorld();

            var totalLandArea = shapesArea / (totalBbox.width * totalBbox.height);

            if(totalLandArea <= 0.0001){
                systemOmitted = true;
                return false;
            }

            landArea = shapesArea / (bbox.width * bbox.height);

            //get a list of all points (with some offset) inside all shapes used for least squares regression
            var bboxDivisions = 50;

            _.each(_.range(bbox.minX, bbox.maxX + 1, (bbox.width + 1) / bboxDivisions), function (x) {
                _.each(_.range(bbox.minY, bbox.maxY + 1, (bbox.height + 1) / bboxDivisions), function(y){
                    var p = [x,y];
                    if(pointInside(p))
                        linearDataXY.push(p);
                });
            });

            _.each(linearDataXY, function(p){
                linearDataYX.push([p[1], p[0]]);
            });

            regX = regression('linear', linearDataXY);
            regY = regression('linear', linearDataYX);
            lines = regressionLines(regX.equation[0], regX.equation[1]).concat( regressionLines(regY.equation[0], regY.equation[1], true) );

            _.each(lines, function(line){
                var ray = computeRay(line.start, line.end);
                if (ray) validRays.push(ray);
            });

            longestRay = _.maxBy(validRays, function(ray){
                return getDist(ray[0], ray[1]);
            });

            rayStart = longestRay[0];
            rayEnd = longestRay[1];
            rayCenter = getMidPoint(rayStart,rayEnd);
            rayLength = getDist(rayStart, rayEnd);

            rayOffsets.push( getMidPoint(rayStart, rayCenter));
            rayOffsets.push(rayCenter);
            rayOffsets.push( getMidPoint(rayCenter, rayEnd));

            longestLineSlope = getSlope(rayStart, rayEnd);

            if(Math.abs(longestLineSlope) == Infinity &&
                rayCenter[0] > (bbox.minX + bbox.width / 2)){
                longestLineSlope *= -1;
            }

            longestLineAngle = Math.atan(longestLineSlope);
            longestLineIntercept = rayCenter[1] - longestLineSlope * rayCenter[0];
            longestLinePSlope = -1 / longestLineSlope;
            longestLinePIntercept = rayCenter[1] - (-1/longestLineSlope) * rayCenter[0];

            _.each(rayOffsets, function(offset) {
                findMidPoint(longestLinePSlope, offset);
            });

            spline = regression('polynomial', relativeMidPoints, 2);
            relativeSplineEquation = spline.equation;

            firstPoint = getExtremePoint('first');
            lastPoint = getExtremePoint('last');

            if (longestLineSlope < 0){
                reverseLetters = true;
                lastPoint = [firstPoint, firstPoint = lastPoint][0]; //swap first and last point
            }


            curveLength = Math.abs((function(){
                var a = relativeSplineEquation[2];
                var b = relativeSplineEquation[1];

                if(a == 0){
                    return getDist(lastPoint.relative, firstPoint.relative);
                }

                var eachPoint = function (p) {
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

                return (eachPoint(lastPoint.relative) - eachPoint(firstPoint.relative));
            })());

            var desiredTextWidth = curveLength * 0.8;

            //calculate font-size vs total text-width ratio
            var fontSizeSlope = (getTextWidth(20) - getTextWidth(10)) / 10;

            //simple solving "y = mx + b" for x where b = 0, fontSizeSlope = m, fontSize = x
            fontSize = desiredTextWidth / fontSizeSlope;

            textWidth = getTextWidth(fontSize);

            letterPoints = placeLetters(firstPoint.relative);
            distFromLast = getDist(letterPoints[letterPoints.length -1].point, lastPoint.relative);
            distFromLast -= ctx.measureText(data.label[data.label.length - 1]).width;
            if (longestLineSlope < 0) distFromLast *= -1;

            labelStartX = arcSolver(relativeSplineEquation[2], relativeSplineEquation[1], firstPoint.relative[0], distFromLast/2);
            labelStartY = relativeSplineEquation[2] * Math.pow(labelStartX, 2) + relativeSplineEquation[1] * labelStartX + relativeSplineEquation[0];

            letterPoints = placeLetters([labelStartX,labelStartY]);

            _.each(letterPoints, function(obj) {
                var point = obj.point;
                if (!point) return;
                var halfLetter = ctx.measureText(obj.letter).width / 2;
                var middlePoint = (longestLineSlope > 0)? point[0] + halfLetter : point[0] - halfLetter;
                var slope = 2 * relativeSplineEquation[2] * middlePoint + relativeSplineEquation[1];
                var angle = Math.atan(slope);
                if (longestLineSlope < 0)
                    angle *= -1;
                angle += longestLineAngle;
                var perpSlope = getPerpendicularSlope(slope);
                var perpAngle = Math.atan(perpSlope);
                var dist = fontSize / 4;
                if (perpSlope < 0) dist *= -1;
                var x = point[0] + dist * Math.cos(perpAngle);
                var y = point[1] + dist * Math.sin(perpAngle);
                var absolutePoint = untranslate([x,y], rayCenter, longestLineSlope);

                letterData.push({letter: obj.letter, width: obj.width, angle: angle, point: absolutePoint});
            });
        };

        this.isOmitted = function () {
            return systemOmitted;
        };

        this.getSplineData = function(){

            return {
                spline: spline,
                firstPoint: firstPoint,
                lastPoint: lastPoint,
                relativeMidPoints: relativeMidPoints,
                midPointRays: midPointRays,
                totalBbox: totalBbox,
                longestRay: {
                    ray: longestRay,
                    start: rayStart,
                    end: rayEnd,
                    center: rayCenter,
                    length: rayLength,
                    slope: longestLineSlope,
                    angle: longestLineAngle,
                    intercept: longestLineIntercept,
                    pslope: longestLinePSlope,
                    pintercept: longestLinePIntercept
                }
            };
        };

        this.getLabelData = function(){
            return {letters: letterData, fontSize: fontSize};
        };


        this.getVertices = function(){
            return polygons;
        };

        this.drawGeometry = function(){

            var canvas = spawnCanvas([world_canvas.width, world_canvas.height]);
            var ctx = canvas.getContext('2d');
            var featureCentered = this.getVertices();

            _.each(data.shapes, function (poly) {

                ctx.fillStyle = (poly.excluded)? "#777" : "#CCC";
                ctx.strokeStyle = "#000";
                ctx.beginPath();

                _.each(poly.vertices, function (shape) {
                    _.each(shape, function (vtx, v_idx) {
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

        this.debugDraw = function (options) {
            if(options === undefined)
                options = {};

            var canvas = spawnCanvas([world_canvas.width, world_canvas.height]);

            if(systemOmitted)
                return canvas;

            var ctx = canvas.getContext('2d');

            var _s = this.getSplineData();

            var numPerpSegments = 20;
            var l = _s.lastPoint.relative[0] - _s.firstPoint.relative[0];
            var raySegment = -l / numPerpSegments;

            var splineEquation = _s.spline.equation;


            if(options.drawLetterPlacement === true){
                //draw per-letter placement data
                var labelData = this.getLabelData();
                ctx.strokeStyle = "#80F";
                ctx.fillStyle = "#80F";
                ctx.lineWidth = 1;
                _.each(labelData.letters, function(obj) {
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
            for(var i = 0; i <= numPerpSegments; i++){
                var x = _s.lastPoint.relative[0] + i * raySegment;
                var y = splineEquation[2] * Math.pow(x,2) + splineEquation[1] * x + splineEquation[0];
                var p = untranslate([x,y], _s.longestRay.center, _s.longestRay.slope);
                if(i == 0){
                    ctx.moveTo(p[0], p[1]);
                }else{
                    ctx.lineTo(p[0], p[1]);
                }
            }
            ctx.stroke();

            ctx.strokeStyle = "#0FF";
            ctx.beginPath();
            var p = _s.longestRay.start;
            ctx.moveTo(p[0], p[1]);
            p = _s.longestRay.end;
            ctx.lineTo(p[0], p[1]);
            ctx.stroke();

            ctx.strokeStyle = "#F0C";
            ctx.fillStyle = '#F0C';
            ctx.lineWidth = 2;
            _.each(_s.midPointRays, function (ray) {
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

            var points = _.map(['firstPoint', 'lastPoint'], function (_k) {
                var p = _s[_k].absolute ;
                return p;
            }).concat(_.map(relativeMidPoints, function (p) {
                return untranslate(p, rayCenter, longestLineSlope);
            }));

            _.each(points, function (p, idx) {
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
        this.drawLabel = function(){

            var canvas = spawnCanvas([world_canvas.width, world_canvas.height]);
            if(systemOmitted)
                return canvas;
            var ctx = canvas.getContext('2d');

            var labelData = this.getLabelData();
            ctx.save();
            _.each(labelData.letters, function(obj) {
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

    function drawEachGroup(todo, args) {
        var canvas = spawnCanvas([world_canvas.width, world_canvas.height]);
        var ctx = canvas.getContext('2d');
        _.each(labelGroups, function (l_group) {
            ctx.drawImage(l_group[todo].apply(l_group, args), 0, 0);
        });
        return canvas;
    };

    this.getLabelGroups = function () {
        return labelGroups;
    };

    this.drawLabels = function(){
        return drawEachGroup('drawLabel');
    };

    this.debugDraw = function(){
        return drawEachGroup('debugDraw');
    };

    this.drawGeometries = function () {
        return drawEachGroup('drawGeometry');
    };
}

RegionLabel.doWrapLongitude = function (feature, tolerance) {

    tolerance = tolerance || 180;

    var testLongitude = function(x1, x2){
        return (Math.abs(x2 - x1) < tolerance);
    };

    var allShapesBbox = [];
    var largestBbox;

    iterateVertices(feature, function (coords, _coords_idx) {
        allShapesBbox.push([]);
        _.each(coords, function (shape) {
            var newBbox = RegionLabel.generateBoundingBox([[shape]]);
            allShapesBbox[_coords_idx].push(newBbox);
            if(!largestBbox){
                largestBbox = newBbox;
            }else if(largestBbox.area < newBbox.area){
                largestBbox = newBbox;
            }
        });

    });

    iterateVertices(feature, function (coords, _coords_idx) {

        var newPoly = [];
        _.each(coords, function (shape, _shape_idx) {
            var shapeBbox = allShapesBbox[_coords_idx][_shape_idx];
            var newShape = [];

            if(!testLongitude(shapeBbox.minX, shapeBbox.maxX)){
                //if the bbox is wider than wrapLongitudeTolerance, we examine/adjust internal vertices

                var lastVtx = null;
                _.each(shape, function (vtx) {
                    var newVtx = null;
                    if(lastVtx && !testLongitude(lastVtx[0], vtx[0])){
                        var delta = (lastVtx[0] < vtx[0])? -360 : 360;
                        newVtx = [vtx[0] + delta, vtx[1]];
                        lastVtx = newVtx;
                    }else{
                        lastVtx = vtx;
                        newVtx = _.clone(vtx);
                    }

                    newShape.push(newVtx);
                });

                //recalculate bbox now that everything is together.
                shapeBbox = RegionLabel.generateBoundingBox([[newShape]]);
            }else{
                newShape = _.clone(shape);
            }

            if (!testLongitude(largestBbox.center[0], shapeBbox.center[0])){
                var delta = (largestBbox.center[0] < shapeBbox.center[0])? -360 : 360;
                var shiftedShape = [];
                _.each(newShape, function (vtx) {
                    shiftedShape.push([vtx[0] + delta, vtx[1]]);
                });
                coords[_shape_idx] = shiftedShape;
            }else{
                coords[_shape_idx] = newShape;
            }
        });
    });
};

RegionLabel.generateBoundingBox = function (allPoints) {
    allPoints = _.flattenDeep(allPoints);
    var _pts = [];
    for(var i = 0; i < allPoints.length; i += 2){
        _pts.push([allPoints[i], allPoints[i+1]]);
    };

    //double-flatten polygons to get a single list of verts
    var bbox = {
        minX: _.minBy(_pts, function (vtx) {
            return vtx[0]
        })[0],
        minY: _.minBy(_pts, function (vtx) {
            return vtx[1]
        })[1],
        maxX: _.maxBy(_pts, function (vtx) {
            return vtx[0]
        })[0],
        maxY: _.maxBy(_pts, function (vtx) {
            return vtx[1]
        })[1],
        within: function (p) {
            return (this.withinX(p) && this.withinY(p));
        },

        withinX: function (p) {
            return (p[0] <= this.maxX && p[0] >= this.minX);
        },

        withinY: function (p) {
            return (p[1] <= this.maxY && p[1] >= this.minY);
        }
    };
    bbox.width = bbox.maxX - bbox.minX;
    bbox.height = bbox.maxY - bbox.minY;
    bbox.area = (bbox.width * bbox.height);
    bbox.points = [[bbox.minX, bbox.minY], [bbox.minX, bbox.maxY], [bbox.maxX, bbox.maxY], [bbox.maxX, bbox.minY]];
    bbox.center = [bbox.minX + bbox.width / 2, bbox.minY + bbox.height / 2];

    return bbox;
};

if(typeof window != 'undefined')
  window.RegionLabel = RegionLabel;

module.exports = RegionLabel;
