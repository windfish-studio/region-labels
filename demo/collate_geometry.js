//recursively collate the geojson data in the ./data folder,
//normalize both the option name and the label
module.exports = function collateGeometry(_d) {
    let geojson_ar = [];

    const appendResult = function (_d) {
        _d.label = ((_d.opts)? _d.opts.label : null) || _d.properties.NAME || _d.groupName;
        _d.name = _d.groupName || _d.label;
        geojson_ar.push(_d);
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

    geojson_ar.sort((a,b) => {
        return (a.name > b.name)? 1 : -1;
    });

    return geojson_ar;
};
