//recursively collate the geojson data in the ./data folder,
//normalize both the option name and the label
module.exports = function collateGeometry(_d) {
    var geojson_ar = [];

    var appendResult = function (_d) {
        geojson_ar.push(_d);
        _d.label = _d.label ||_d.properties.NAME || _d.optionsName;
        _d.name = _d.optionsName || _d.label;
    };

    if(_d instanceof Array){
        _d.forEach(function (datum) {
            geojson_ar = geojson_ar.concat(collateGeometry(datum));
        });
    }else if(_d instanceof Object){
        if(_d.type)
            switch(_d.type){
                case 'Grouping':
                    appendResult(_d);
                    break;
                case 'FeatureCollection':
                    geojson_ar = geojson_ar.concat(collateGeometry(_d.features));
                    break;
                case 'Feature':
                    appendResult(_d);
                    break;
            }
        else
            Object.keys(_d).forEach(function (_k) {
                var _v = _d[_k];
                geojson_ar = geojson_ar.concat(collateGeometry(_v));
            });
    }
    return geojson_ar;
};
