export function geoJsonIterateVertices(geojson, iter){
    if(geojson.type && geojson.type === 'FeatureCollection'){
        geojson.features.forEach(_f => {
            geoJsonIterateVertices(_f, iter);
        });
        return;
    }

    switch(geojson.geometry.type){
        case 'MultiPolygon':
            geojson.geometry.coordinates.forEach((_v, _i) => {
                iter(_v, _i);
            });
            break;
        case 'Polygon':
            var verts = geojson.geometry.coordinates;
            iter(verts, 0);
            break;
        default:
            throw 'geometry type '+geojson.geometry.type+' not supported';
            break;
    }
}