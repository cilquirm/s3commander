"use strict";

var $ = require('jquery');
var Path = require('./Path');
var b64_hmac_sha1 = require('./sha1').b64_hmac_sha1;
var rstr2b64 = require('./sha1').rstr2b64;

function S3Backend(options) {
    // resolve backend options
    this.opts = $.extend({
        "sAccessKey": "",
        "sSecretKey": "",
        "sBucket": "",
        "pPrefix": new Path("", true),
        "sEndpoint": "s3.amazonaws.com",
        "bShowVersions": false,
        "iMaxFilesizeMB": 1024
    }, options);
}

// Sign a string using an AWS secret key.
S3Backend.prototype.sign = function(sSecretKey, sData) {
    return b64_hmac_sha1(sSecretKey, sData);
};

// Sign an Amazon AWS REST request.
// http://docs.aws.amazon.com/AmazonS3/latest/dev/RESTAuthentication.html
S3Backend.prototype.signRequest = function(sMethod, pResource, oParams) {
    // default parameter values
    sMethod = typeof sMethod !== 'undefined' ? sMethod : "GET";
    pResource = typeof pResource !== 'undefined' ? pResource : new Path();
    oParams = typeof oParams !== 'undefined' ? oParams : new Object();

    // this is used as the request and signature expiration timestamp
    // for convenince. the request timestamp must be within 15
    // minutes of the time on amazon's aws servers and the expiration
    // timestamp must be in the future so we add (XXX 6 hours ???)
    var timestamp = parseInt(new Date().valueOf() / 1000) + 21600;

    // create the signature plaintext
    var secure = sMethod + "\n\n\n";
    secure += timestamp + "\n";
    secure += "/" + this.opts.sBucket + "/";

    if (!pResource.empty()) {
        secure += this.opts.pPrefix.concat(pResource).getURIEncoded();
    }

    var delimiter = "?";
    if (this.opts.bShowVersions && sMethod == "GET" && pResource.folder) {
        secure += "?versions";
        delimiter = "&";
    }

    var params = $.param(oParams);
    if (params.length > 0) {
        secure += delimiter + params;
    }

    // return the query parameters required for this request
    return $.extend({}, oParams, {
        'AWSAccessKeyId': this.opts.sAccessKey,
        'Signature': this.sign(this.opts.sSecretKey, secure),
        'Expires': timestamp,
    });
};

// Retrieve the REST API URL for a bucket.
S3Backend.prototype.getBucketURL = function() {
    // we can't use https:// if the bucket name contains a '.' (dot)
    // because the SSL certificates won't work
    var protocol = "https";
    if (this.opts.sBucket.indexOf(".") !== -1) {
        protocol = "http";
        console.log("WARNING: Using clear-text transport protocol http:// !");
    }

    // construct the url
    return protocol + "://" + this.opts.sBucket + "." + this.opts.sEndpoint;
};

// Retrieve the REST API URL for the given resource.
S3Backend.prototype.getResourceURL = function(pResource) {
    var abspath = this.opts.pPrefix.concat(pResource);
    return this.getBucketURL() + "/" + abspath.getURIEncoded();
};

// Get the encoded policy and it's signature required to upload files.
S3Backend.prototype.getPolicyData = function() {
    // create the policy
    var policy = {
        "expiration": "2020-12-01T12:00:00.000Z",
        "conditions": [
            {"acl": "private"},
            {"bucket": this.opts.sBucket},
            ["starts-with", "$key", this.opts.pPrefix.toString()],
            ["starts-with", "$Content-Type", ""],
        ],
    };

    // encode the policy as Base64 and sign it
    var policy_b64 = rstr2b64(JSON.stringify(policy));
    var signature = this.sign(this.opts.sSecretKey, policy_b64);

    // return the policy and signature
    return {
        "acl": "private",
        "policy": policy_b64,
        "signature": signature,
    };
};

// Get form parameters for uploading a file to the given folder.
// The paramters returned by this function should be stored in a <form />
// element using <input type="hidden" name="..." value="..." /> elements.
S3Backend.prototype.getUploadParams = function(pFolder) {
    var uploadpath = this.opts.pPrefix.concat(pFolder).push("${filename}");
    return $.extend(this.getPolicyData(), {
        "AWSAccessKeyId": this.opts.sAccessKey,
        "Content-Type": "application/octet-stream",
        "key": uploadpath.toString()
    });
};

// Retrieve the contents of the given folder.
// http://docs.aws.amazon.com/AmazonS3/latest/API/RESTBucketGET.html
S3Backend.prototype.list = function(pFolder) {
    // default parameter values
    pFolder = typeof pFolder !== 'undefined' ? pFolder : new Path("", true);

    if (!pFolder.folder) {
        console.log("listContents(): not a folder: " + pFolder.toString());
        return false;
    }

    // sign the request
    var signdata = this.signRequest("GET", new Path("", true));

    // determine the absolute folder path
    var abspath = this.opts.pPrefix.concat(pFolder);

    // request bucket contents with the absolute folder path as a prefix
    // and group results into common prefixes using a delimiter
    return $.ajax({
        url: this.getBucketURL() + (this.opts.bShowVersions ? "?versions" : ""),
        data: $.extend(signdata, {
            "prefix": abspath.toString(),
            "delimiter": "/",
        }),
        dataFormat: "xml",
        cache: false,
        error: function(data){
            console.log("S3Backend error:" + data.responseText);
        },
    }).then(function(data){
        // store prefix so we can rebase paths further down
        var prefix = this.opts.pPrefix;

        // decide how to parse the results
        if (this.opts.bShowVersions) {
            var query = {
                "folder": "ListVersionsResult > CommonPrefixes > Prefix",
                "file": "ListVersionsResult > Version",
                "delete": "ListVersionsResult > DeleteMarker"
            };
        }
        else {
            var query = {
                "folder": "ListBucketResult > CommonPrefixes > Prefix",
                "file": "ListBucketResult > Contents"
            };
        }

        // extract folders
        var folders = new Object();
        $.each(
            $(data).find(query.folder),
            function(i, item){
                // we treat common prefixes as folders even though technically they
                // are a side effect of the keys that actually represent folders
                var path = new Path($(item).text(), true);
                folders[path] = {
                    "path": path.rebase(prefix),
                    "name": path.basename(),
                };
            });

        // extract files
        var files = new Object();
        $.each(
            $(data).find(query.file),
            function(i, item){
                // this could be a file or a folder depending on the key
                var path = new Path().push(
                    $(item).find("Key").text()
                ).rebase(prefix);

                if (path.folder) {
                    // ignore folders
                    return;
                }

                // get or create the file entry
                var entry = path in files ? files[path] : {
                    "path": path,
                    "name": path.basename(),
                    "versions": new Array(),
                };

                // store the version information
                if (this.opts.bShowVersions) {
                    entry.versions.push({
                        "deleted": false,
                        "version": $(item).find("VersionId").text(),
                        "modified": new Date($(item).find("LastModified").text()),
                    });
                }

                // store the file entry
                files[path] = entry;
            }.bind(this));

        // delete markers
        if (this.opts.bShowVersions) {
            $.each(
                $(data).find(query["delete"]),
                function(i, item){
                    // this could be a file or a folder depending on the key name
                    var path = new Path().push(
                        $(item).find("Key").text()
                    ).rebase(prefix);

                    if (path.folder) {
                        // ignore folders
                        return;
                    }

                    // update the file's version information
                    files[path].versions.push({
                        "deleted": true,
                        "version": $(item).find("VersionId").text(),
                        "modified": new Date($(item).find("LastModified").text()),
                    });
                });
        }

        // sort file versions
        if (this.opts.bShowVersions) {
            $.each(files, function(path, entry){
                entry.versions.sort(function(a, b){
                    var am = a.modified;
                    var bm = b.modified;

                    if (am < bm){
                        return -1;
                    }
                    else if (am > bm) {
                        return 1;
                    }
                    else {
                        return 0;
                    }
                });
            });
        }

        // return directory contents
        return {
            "path": pFolder,
            "files": files,
            "folders": folders,
        };
    }.bind(this));
};

// Create a folder with the given path. Folders are S3 objects where
// the key ends in a trailing slash.
S3Backend.prototype.createFolder = function(pResource) {
    if (!pResource.folder) {
        console.log("createFolder(): not a folder: " + pResource.toString());
        return false;
    }

    var signdata = this.signRequest("PUT", pResource);
    var url = this.getResourceURL(pResource) + "?" + $.param(signdata);

    return $.ajax({
        url: url,
        type: "PUT",
        data: "",
        error: function(data){
            console.log("S3Backend error: " + data.responseText);
        }
    });
};

// Delete the folder at the given path. Folders are S3 objects where
// the key ends in a trailing slash.
S3Backend.prototype.deleteFolder = function(pResource) {
    if (!pResource.folder) {
        console.log("deleteFolder(): not a folder: " + pResource.toString());
        return false;
    }

    var signdata = this.signRequest("DELETE", pResource);
    var url = this.getResourceURL(pResource) + "?" + $.param(signdata);

    return $.ajax({
        url: url,
        type: "DELETE",
        error: function(data){
            console.log("S3Backend error: " + data.responseText);
        },
    });
};

// Download the file at the given path. This creates a link to download
// the file using the user's AWS credentials then opens it in a new window.
// http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectGET.html
S3Backend.prototype.downloadFile = function(pResource, sVersion) {
    sVersion = typeof sVersion !== 'undefined' ? sVersion : "";
    if (pResource.folder) {
        console.log("downloadFile(): not a file: " + pResource.toString());
        return;
    }

    var params = {
        'response-cache-control': 'No-cache',
        'response-content-disposition': 'attachment',
    };

    if (sVersion.length > 0) {
        params["versionId"] = sVersion;
        // params["response-content-disposition"] += "; filename=FOO_VERSION"
    }

    var signdata = this.signRequest("GET", pResource, params);
    var url = this.getResourceURL(pResource) + "?" + $.param(signdata);
    window.open(url, "_blank");
};

// Delete the file at the given path.
// http://docs.aws.amazon.com/AmazonS3/latest/API/RESTObjectDELETE.html
S3Backend.prototype.deleteFile = function(pResource) {
    if (pResource.folder) {
        console.log("deleteFile(): not a file: " + pResource.toString());
        return false;
    }

    var signdata = this.signRequest("DELETE", pResource);
    var url = this.getResourceURL(pResource) + "?" + $.param(signdata);

    return $.ajax({
        url: url,
        type: "DELETE",
        error: function(data){
            console.log("S3Backend error: " + data.responseText);
        },
    });
};

module.exports = S3Backend;
