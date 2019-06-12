export function isServer () {
    return (typeof document == 'undefined');
};

export function spawnCanvas (dims) {
    var canvas;
    if(isServer()){
        var pkgName = 'canvas';
        const { createCanvas } = require(pkgName); //so that this won't be parsed by browserify
        canvas = createCanvas(Math.ceil(dims[0]), Math.ceil(dims[1]));
    }else{
        var canvas = document.createElement('canvas');
        canvas.width = Math.ceil(dims[0]);
        canvas.height = Math.ceil(dims[1]);
    }

    return canvas;
}
