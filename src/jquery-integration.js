/************************************************************************
 * jQuery Integration                                                   *
 ************************************************************************/
var $ = require('jquery');
var Path = require('./Path');
var S3Backend = require('./S3Backend');
var S3Commander = require('./components').S3Commander;

// create an s3commander window
$.fn.s3commander = function(options) {
    // resolve component options
    var opts = $.extend({}, $.fn.s3commander.defaults, options);

    // create the backend
    opts["backend"] = new S3Backend({
        "sAccessKey": opts.sAccessKey,
        "sSecretKey": opts.sSecretKey,
        "sBucket": opts.sBucket,
        "pPrefix": new Path(opts.sPrefix, true),
        "sEndpoint": opts.sEndpoint,
        "bShowVersions": opts.bShowVersions,
        "iMaxFilesizeMB": opts.iMaxFilesizeMB
    });

    // create the react element and attach it to the container
    var container = $(this);
    ReactDOM.render(
        React.createElement(S3Commander, opts),
        container.get(0));

    // return the container
    return container;
};

// default settings
$.fn.s3commander.defaults = {
    "sAccessKey": "",
    "sSecretKey": "",
    "sBucket": "",
    "sPrefix": "",
    "sEndpoint": "s3.amazonaws.com",
    "bShowVersions": false,
    "bConfirmDelete": false,
    "iMaxFilesizeMB": 1024
};

