# region-labels

This package is aimed to algorithmically generate labels for two-dimensional geographic regions which will best adapt to the shape and size of the region.

![Italy labelled using region-labels algorithm, with debug lines](https://rawcdn.githack.com/windfish-studio/region-labels/a485eca1be1701731454be42d3daf95025375b88/dist/italy_example.png)

### JSFiddle Demo

Here is a JSFiddle demo: https://jsfiddle.net/sikanrong/8304Lpvr/

### Change log

###### June 14, 2019
- Adding support for [DBSCAN](https://en.wikipedia.org/wiki/DBSCAN) clustering. The algorithm can now automatically detect clusters of shapes within a feature and label each cluster separately.
- Massive cleaning of the code; using proper ES6 class structure and import/export syntax. Breaking up this giant monolith into smaller pieces and spreading it out across more source-files. 
- Proper scoping of member variables within the two main classes of the library.
- Migrate the project to WebPack and babel instead of using browserify.
- Use [AVA](https://github.com/avajs/ava) test framework instead of the tape package.
- Adding more tests for the DBSCAN functionality, as well as cleaning up the tests a lot by externalizing the expected test results into their own file.
 

### Documentation

#### constructor

RegionLabel class constructor takes a [GeoJSON](https://geojson.org/) object as the fist parameter, and an _options_ object as the second. 

The GeoJSON object can either be a single _Feature_, or a _FeatureCollection_. By default, if a _FeatureCollection_ is given, each feature will be labelled individually. 

Only geometry of type _Polygon_ and _MultiPolygon_ are supported.

The following options are accepted:

- **margin** - accepts an integer of how many pixels to leave as margin between the label and the edge of the canvas
- **canvasDims** - the dimensions of the desired label must be passed in as options so that the given geography and label can be centered within those dimensions
- **canvas** - optionally an existing canvas of desired size can be passed instead of _canvasDims_
- **label** - the desired label for the region. _label_ can either be a string, or a callback function which takes the _properties_ object of each feature and returns the desired label.
```javascript
{label: (_props) => {return _props.NAME}}
```
 
- **excludeFeatures** - A function to which the properties of each Feature is passed. If the function returns true, that feature will be excluded from the labeling; e.g. the label will actively avoid that feature and label the rest as a group. Useful for countries or administrative areas landlocked entirely within some other single region.

```javascript
{excludeFeatures: (_props) => {
    return (_props.LAND_AREA > 3.5);
}}
```
- **forceSingleLabel** - if set to ```true```, it will treat all features in the _FeatureCollection_ as a single shape and generate a single label for all features. Defaults to ```false```.

- **dbscanClustering** - if set to ```true```, the [DBSCAN](https://en.wikipedia.org/wiki/DBSCAN) algorithm is used to automatically create groupings of shapes _within_ a feature, and label them separately. Defaults to ```false```.

- **dbscanPointDensity** - The algorithm will overlay the geographies with a point grid to perform [DBSCAN](https://en.wikipedia.org/wiki/DBSCAN) clustering. This parameter controls the density of the points of this grid, which will hold (```dbscanPointDensity```)² points. Defaults to ```10```.

- **dbscanMinPoints** - The minimum number of points for the [DBSCAN](https://en.wikipedia.org/wiki/DBSCAN) algorithm to consider that cluster as part of a labelling-group. Defaults to ```2```.

- **dbscanRadiusScale** - The clustering radius for the [DBSCAN](https://en.wikipedia.org/wiki/DBSCAN) algorithm is by default set as the greatest distance between points on the grid, multiplied by ```dbscanRadiusScale```. Defaults to ```2```.

#### drawLabels
The drawLabels function will draw all of the generated labels to a canvas, and return that canvas.

```javascript
var labelCanvas = rl.drawLabels();
//Draws the generated labels to some other canvas
ctx.drawImage(labelCanvas, 0, 0); 
```

#### drawGeometries
The drawGeometries function will draw all of the passed GeoJSON to a canvas and return that canvas.
```javascript
var geometryCanvas = rl.drawGeometries();
ctx.drawImage(geometryCanvas, 0, 0);
```
 
#### debugDraw
This will return a canvas with some colored lines and points which are mathematically meaninful in terms of how final the label spline is calculated. Primarily used for debugging; useful as an overlay atop the label/geometry data.

```javascript
var debugCanvas = rl.debugDraw();
ctx.drawImage(debugCanvas, 0, 0);
``` 

### Tests
Run tests just by executing 
```bash
npm run test
```
```
TAP version 13
# should use DBSCAN to correctly separate USA into logical labeling groups
ok 1 - should use DBSCAN to correctly separate USA into logical labeling groups
# should generate labels for all test geographies without issue
ok 2 - should generate labels for all test geographies without issue
# should generate correct label data for Texas
ok 3 - should generate correct label data for Texas
# should generate correct label data for New Jersey
ok 4 - should generate correct label data for New Jersey
# should generate correct label data for Hawaii
ok 5 - should generate correct label data for Hawaii
# should generate correct label data for Russia. Should wrap Iultinsky District
ok 6 - should generate correct label data for Russia. Should wrap Iultinsky District

1..6
# tests 6
# pass 6
# fail 0
```

### Authors
 Written in Barcelona and Santa Cruz de Tenerife, Spain. 2017-2019
```
Alexander Pilafian <sikanrong@gmail.com>
Aleksandra Gabka <rivvel@gmail.com>
``` 