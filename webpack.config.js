module.exports = {
  module: {
    loaders: [{
      loader: 'json-loader',
      test: /\.json$/
    }]
  },
  entry: [
    './src/sha1.js',
    './src/Path.js',
    './src/S3Backend.js',
    './src/components.js',
    './src/jquery-integration.js'
  ],
  output: {
    path: './build',
      filename: 's3commander.min.js'
    },
  externals: {
    "jquery": "jQuery",
    "dropzone": 'Dropzone'
  }
};
