'use strict';

var gulp = global.gulp = require('gulp');
var gls = require('gulp-live-server');
var fs = require("fs");
var states = require("./data/geo.json");
var _ = require("lodash");

require("./gulp/browserify");

gulp.task('server', ['bsfy'], function() {
    var server = gls.static('.', 9191);
    server.start();
});


