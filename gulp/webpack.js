const webpack = require('webpack');
const path = require('path');
const gulp = require('gulp');

const dist_path = path.resolve(__dirname, '../dist');
const app_entrypoint = path.resolve(__dirname, '../lib/regionLabel.js');
const demo_entrypoint = path.resolve(__dirname, '../demo/demo.js');

const vendor_deps = Object.keys(require('../package.json').dependencies);
const extra_plugins = [];
let appConf;

const doPack = function(conf, watch){

    return new Promise((resolve, reject) => {
        const reportStats = (err, stats) => {
            console.log(stats.toString({
                colors: true
            }));

            if (err) {
                reject();
                return;
            }

            resolve();
        };

        const compiler = webpack(conf);

        if(watch){
            compiler.watch({
                aggregateTimeout: 300,
                ignored: [/[\\/]node_modules[\\/]/, /[\\/]assets[\\/]generated[\\/]/]
            }, reportStats);
        }else{
            compiler.run(reportStats);
        }
    });
};

gulp.task('webpack-vendor', async function webpackVendor () {
    return doPack({
        entry: {
            vendor: vendor_deps
        },

        output: {
            path: dist_path,
            filename: '[name].js',
            library: '[name]',
            publicPath: '/'
        },

        node: {
            fs: "empty"
        },

        plugins: [
            new webpack.DllPlugin({
                name: '[name]',
                path: path.join( dist_path, '[name]-manifest.json' ),
            })
        ]
    }, false);
});


gulp.task('webpack', gulp.series('webpack-vendor', async function webpackWatch () {
    appConf = {
        entry: {
            "region-labels": app_entrypoint,
            "demo": demo_entrypoint
        },
        output: {
            path: dist_path,
            filename: '[name].js',
            publicPath: '/'
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: "babel-loader"
                    }
                }
            ]
        },

        plugins: [
            new webpack.DllReferencePlugin({
                manifest: require(path.join(dist_path, 'vendor-manifest.json')),
            }),

            new webpack.SourceMapDevToolPlugin({
                exclude: ['vendor'],
                filename: '[name].js.map'
            })
        ].concat(extra_plugins)
    };

    return doPack(appConf, true);
}));