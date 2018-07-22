# region-labels

The region-labels package is aimed to algorithmically generate labels for two-dimensional
geographic regions which will best adapt to the shape and size of the region to attempt 
to maximally fill the space.

### JSFiddle Demo

Here is a JSFiddle demo: https://jsfiddle.net/sikanrong/8304Lpvr/

### Documentation

####constructor

Generally the RegionLabel class constructor takes a GeoJSON object as the fist 
parameter, and an options object as the second. The GeoJSON object can either be 
a single Feature or a FeatureCollection. Geometry of Polygon and MultiPolygon are
accepted.

The following options are accepted:

- _margin_ - accepts an integer of how many pixels to leave as margin between the 
label and the edge of the canvas
- _canvasDims_ - the dimensions of the desired label must be passed in as options 
so that the given geography and label can be centered within those dimensions
- _canvas_ - optionally an existing canvas of desired size can be passed instead 
of _canvasDims_
- _label_ - the desired label for the region. If _label_ is a string, the passed 
GeoJSON FeatureCollection will be labeled as a group. If _label_ is a function,
the function will be called to determine the label to draw for each Feature within
the FeatureCollection.
- _excludeFeatures_ - A function to which the properties of each Feature is
passed. If the function returns true, that feature will be excluded from the
labeling; e.g. the label will actively avoid that feature and label the rest 
as a group. Useful for countries or administrative areas landlocked entrely 
within some other single region.


```javascript
rl = new RegionLabel(geojson, {
    margin: 20,
    canvasDims: [256, 256],
    label: 'United States',
});
```

####drawLabels
The drawLabels function will draw all of the generated labels to a canvas, and
return that canvas.

```javascript
var labelCanvas = rl.drawLabels();
//Draws the generated labels to some other canvas
ctx.drawImage(labelCanvas, 0, 0); 
```

####drawGeometries
The drawGeometries function will draw all of the passed GeoJSON to a canvas
and return that canvas.
```javascript
var geometryCanvas = rl.drawGeometries();
ctx.drawImage(geometryCanvas, 0, 0);
```
 
####debugDraw
This will return a canvas with some colored lines and points which are 
mathematically meaninful in terms of how final the label spline is 
calculated. Primarily used for debugging; useful as an overlay atop
the label/geometry data.

```javascript
var debugCanvas = rl.debugDraw();
ctx.drawImage(debugCanvas, 0, 0);
``` 

###Tests
Run tests just by executing ```node ./test.js```

###Authors
 
 Written in Barcelona and Santa Cruz de Tenerife, Spain. 2017-2018
```
Alexander Pilafian <sikanrong@gmail.com>
Aleksandra Gabka <rivvel@gmail.com>
``` 