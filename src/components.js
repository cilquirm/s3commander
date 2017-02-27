"use strict";
/**
 * S3 Commander
 *
 * Version: 0.4.0
 * Authors: Aadi Deshpande, Alexandru Barbur, Eric Amador, Shaun Brady, Dean Kiourtsis,
 *          Mike Liu, Brian Schott
 */

var $ = require('jquery');
var Dropzone = require('dropzone');
var Path = require('./Path');
var mimeLookup = require('mime-types').lookup;

// configure sha1.js for RFC compliance

/************************************************************************
 * User Interface                                                       *
 ************************************************************************/

var S3CBreadcrumbs = React.createClass({
    "render": function() {
        var crumbs = $.map(this.props.data.parts, function(part, i) {
            var key = "crumb-" + i;
            return React.createElement( 'span', { key: key }, part );
        });

        var elements = [
            React.createElement( 'span', { className: 'glyphicon glyphicon-hdd' }, null ),
            React.createElement( 'span', null, '/' ),
        ];


        Array.prototype.push.apply(elements, crumbs);

        Array.prototype.push.apply(elements,[
            React.createElement( 'button', { className: this.props.style.button, onClick: this.props.onRefresh }, 'Refresh' ),
            React.createElement( 'button', { className: this.props.style.button, onClick: this.props.onNavUp }, 'Up' ),
        ]);

        return React.createElement.apply( this, [ 'div', { className: this.props.style.control } ].concat( elements ) );
    },
});

var S3COptionsControl = React.createClass({
    "componentDidMount": function() {
        var self = this;
        $(ReactDOM.findDOMNode(self))
            .find("#chkShowDeleted")
            .bootstrapToggle({
                "size": "mini",
                "on": "On <span class='glyphicon glyphicon-asterisk'></span>&nbsp;",
            })
            .on('change', this.onShowDeletedChange);
    },
    "onShowDeletedChange": function(e) {
        this.props.setStateOptions({
            "showDeletedFiles": $("#chkShowDeleted").prop("checked"),
        });
    },
    "render": function() {
        return React.createElement( 'div', { className: this.props.style.control },
                                    React.createElement( 'span', null, 'Show Deleted Files' ),
                                    React.createElement( 'input', { type: 'checkbox', id: 'chkShowDeleted', defaultChecked: (this.props.options.showDeletedFiles ? 'checked' : '' ) }, null )
                                  );
    },
});

var S3CFolder = React.createClass({
    "onNav": function(e){
        this.props.onNavFolder(this.props.data);
    },
    "onDelete": function(e){
        this.props.onDeleteFolder(this.props.data);
    },
    "render": function(){
        return React.createElement( 'div', { className: this.props.style.entry },
                                    React.createElement( 'span', { className: 'glyphicon glyphicon-folder-open' }, null ),
                                    React.createElement( 'a', { onClick: this.onNav }, this.props.data.name ),
                                    React.createElement( 'button', { className: this.props.style.button, onClick: this.onDelete }, 'Delete' )
                                  );
    },
});

var S3CFileVersion = React.createClass({
    "onDownload": function(e){
        this.props.onDownloadVersion(this.props.data);
    },
    "render": function(){
        var data = this.props.data;
        var props = {
            "className": this.props.style.entry,
            "key": this.props.key
        };

        return data.deleted ? (
            React.createElement( 'div', props,
                                 React.createElement( 'span', { className: 'glyphicon glyphicon-trash' }, null ),
                                 React.createElement( 'span', null, data.modified.toString() )
                               )
        ) : (
            React.createElement( 'div', props,
                                 React.createElement( 'span', { clasName: 'glyphicon glyphicon-time' }, null ),
                                 React.createElement( 'span', null, data.modified.toString() )
                               )
        );
    },
});

var S3CFile = React.createClass({
    "getInitialState": function(){
        return {
            "showVersions": false
        };
    },
    "getLatestVersion": function(){
        var versions = this.props.data.versions;
        if (versions.length == 0) {
            return undefined;
        }

        return versions[versions.length - 1];
    },
    "onDownload": function(e){
        this.props.onDownloadFile(this.props.data);
    },
    "onDelete": function(e){
        this.props.onDeleteFile(this.props.data);
    },
    "onToggleVersions": function(e){
        this.setState({
            "showVersions": !this.state.showVersions
        });
    },
    "onDownloadVersion": function(entry){
        this.props.onDownloadFileVersion(this.props.data, entry.version);
    },
    "render": function(){
        var file = this.props.data;

        // file versions
        var versions = $.map(file.versions, function(entry){
            var props = {
                "data": entry,
                "style": this.props.style,
                "onDownloadVersion": this.onDownloadVersion,
                "key": "file-" + file.name + "-" + entry.version
            };

            return React.createElement( S3CFileVersion, props, null );
        }.bind(this));

        var elements = [
            React.createElement( 'span', { className: 's3icon glyphicon glyphicon-file', onClick: this.onDownload }, null ),
            React.createElement( 'a', { className: this.props.style.link , onClick: this.onDownload }, file.name ),
        ];

        if ( versions.length > 0 && this.getLatestVersion().deleted  ) {
            elements.push( createElement( 'span', { className: 'glyphicon glyphicon-asterisk' }, null ) );
        } else {
            elements.push( React.createElement( 'button', { className: this.props.style.button, onClick: this.onDelete }, 'Delete' ) );
        };

        if ( this.state.showVersions ) {
            elements = elements.concat(versions);
        }

        // file control
        return React.createElement.apply( this, [ 'div', { className: this.props.style.entry } ].concat( elements ) );
    },
});

var S3CFolderForm = React.createClass({
    "onCreate": function(e) {
        e.preventDefault();
        var name = this.refs.name.value;
        this.props.onCreateFolder(name);
    },
    "render": function() {
        return React.createElement( 'form', { className: this.props.style.form },
                                    React.createElement( 'div', { className: 'form-group' },
                                                         React.createElement( 'input', { type: 'text', className: 'form-control', ref: 'name' }, null )
                                                       ),
                                    React.createElement( 'button', { className: this.props.style.button, type: 'submit', onClick: this.onCreate }, 'Create Folder' )
                                  );
    },
});

var S3CUploadForm = React.createClass({
    "componentWillMount": function() {
        // detect if we have dropzone support
        this.useDropzone = (typeof window.Dropzone !== 'undefined');
    },
    "componentDidMount": function() {
        // check if we're using dropzone
        if (!this.useDropzone) {
            // do nothing
            return;
        }
        var self = this;

        // create the dropzone object
        var component = this;
        this.dropzone = new Dropzone(ReactDOM.findDOMNode(self), {
            "url": this.props.url,
            "init": function(){
                // enable uploading to folders by manipulating the S3 object key
                // TODO this is S3 specific and violates the backend/frontend barrier
              this.on("sending", function(file, xhr, formData){

                    var contentType = mimeLookup(file.name) || 'application/octet-stream';
                    formData.set('Content-Type', contentType);

                    if(file.hasOwnProperty("fullPath")) {
                        formData.append("key", new Path(component.props.params.key)
                                        .pop()                  // pop original ${filename} token
                                        .push(file.fullPath)    // push full path to the file
                                        .pop()                  // pop filename component
                                        .push("${filename}")    // push the S3 ${filename} token
                          .toString());
                    }
                    else {
                        formData.append("key", component.props.params.key);
                    }

                });
            },
            "error": function(file, error){
                alert(error);
            },
            "complete": function(file){
                // remove the file from dropzone
                this.removeFile(file);

                // refresh the screen
                component.props.onRefresh();
            },
            "clickable": ".fileinput-button",
            "maxFilesize": this.props.iMaxFilesizeMB
        });
    },
    "componentWillUnmount": function(){
        // check if we're using dropzone
        if (!this.useDropzone) {
            // do nothing
            return;
        }

        // destroy the dropzone
        this.dropzone.destroy();
        this.dropzone = null;
    },
    "render": function(){
        // upload form parameters
        var params = $.map(this.props.params, function(value, name){
            // let dropzone manipulate the upload key
            // TODO this is S3 specific and violates the frontend/backend barrier
            if (this.useDropzone && name == "key") {
                return false;
            }

            var key = "param-" + name;
            return React.createElement( 'input', { type: 'hidden', name: name, value: value, key: key }, null );
        }.bind(this));

        // form properties
        var formprops = {
            "className": this.props.style.form,
            "encType": "multipart/form-data",
            "action": this.props.url,
            "method": "post"
        };

        if (this.useDropzone) {
            formprops["className"] += " dropzone";
        }

        params.push(
            React.createElement( 'span', { className: 'btn btn-primary fileinput-button dz-clickable' },
                                 React.createElement( 'i', { className: 'glyphicon glyphicon-plus' }, null ),
                                 'Add Files...'
                               )
        );

        if ( !this.useDropzone ) {
            params.push(
                React.createElement( 'div', { className: 'form-group' },
                                     React.createElement( 'input', { type: 'file', name: 'file' } )
                                   ),
                React.createElement( 'button', { className: 'this.props.style.button', type: 'submit' }, 'Upload' )
            );
        }

        // create components
        return React.createElement.apply( this, [ 'form', formprops ].concat( params ) );
    },
});

var S3Commander = React.createClass({
    "getInitialState": function(){
        return {
            "path": new Path("", true),
            "files": new Object(),
            "folders": new Object(),
            "options": {
                "confirmDelete": this.props.bConfirmDelete,
                "showDeletedFiles": false,
            }
        };
    },
    "getDefaultProps": function(){
        return {
            "style": {
                "container": "s3contents",
                "control": "s3control",
                "entry": "s3entry",
                "form": "s3form form-inline",
                "button": "btn btn-xs btn-primary pull-right",
                "link" : "s3link",
            },
        };
    },
    "setStateContents": function(contents){
        this.setState($.extend({}, this.state, contents));
    },
    "setStateOptions": function(options){
        this.setState({
            "path": this.state.path,
            "files": this.state.files,
            "folders": this.state.folders,
            "options": $.extend({}, this.state.options, options),
        });
    },
    "componentDidMount": function(){
        this.props.backend.list()
            .done(function(contents){
                this.setStateContents(contents);
            }.bind(this))
            .fail(function(){
                alert("failed to list contents");
            }.bind(this));
    },
    "onNavUp": function(){
        var path = this.state.path.pop();
        this.props.backend.list(path)
            .done(function(contents){
                this.setStateContents(contents);
            }.bind(this))
            .fail(function(){
                alert("failed to list contents");
            }.bind(this));
    },
    "onRefresh": function(){
        var path = this.state.path;
        this.props.backend.list(path)
            .done(function(contents){
                this.setStateContents(contents);
            }.bind(this))
            .fail(function(){
                alert("failed to list contents");
            }.bind(this));
    },
    "onNavFolder": function(folder){
        var path = this.state.path.push(folder.name + "/");
        this.props.backend.list(path)
            .done(function(contents){
                this.setStateContents(contents);
            }.bind(this))
            .fail(function(){
                alert("failed to list contents");
            }.bind(this));
    },
    "onCreateFolder": function(name){
        // validate name
        if (name.match("^[a-zA-Z0-9 _\-]+$") == null) {
            alert("Folder name is invalid!");
            return;
        }

        // create the folder
        var folder = this.state.path.clone().push(name + "/");
        this.props.backend.createFolder(folder)
            .done(function(){
                this.onRefresh();
            }.bind(this))
            .fail(function(){
                alert("failed to create folder");
            }.bind(this));
    },
    "onDeleteFolder": function(folder){
        if(this.state.options.confirmDelete){
            var msg = "Do you want to delete the " + folder.name + " folder?";
            if (!window.confirm(msg)){
                return;
            }
        }

        this.props.backend.deleteFolder(folder.path)
            .done(function(){
                this.onRefresh();
            }.bind(this))
            .fail(function(){
                alert("failed to delete folder");
            }.bind(this));
    },
    "onDownloadFile": function(file){
        this.props.backend.downloadFile(file.path);
    },
    "onDownloadFileVersion": function(file, version){
        this.props.backend.downloadFile(file.path, version);
    },
    "onDeleteFile": function(file){
        if(this.state.options.confirmDelete){
            var msg = "Do you want to delete the " + file.name + " file?";
            if (!window.confirm(msg)){
                return;
            }
        }

        this.props.backend.deleteFile(file.path)
            .done(function(){
                this.onRefresh();
            }.bind(this))
            .fail(function(){
                alert("failed to delete file");
            }.bind(this));
    },
    "render": function(){
        // determine common properties
        var props = {
            "style": this.props.style,
            "options": this.state.options,
            "setStateOptions": this.setStateOptions,
            "onNavUp": this.onNavUp,
            "onRefresh": this.onRefresh,
            "onNavFolder": this.onNavFolder,
            "onCreateFolder": this.onCreateFolder,
            "onDeleteFolder": this.onDeleteFolder,
            "onDownloadFile": this.onDownloadFile,
            "onDownloadFileVersion": this.onDownloadFileVersion,
            "onDeleteFile": this.onDeleteFile,
        };

        // folders
        var folders = $.map(this.state.folders, function(folder){
            var key = "folder-" + folder.name;
            return React.createElement( S3CFolder, Object.assign( {}, props, { data: folder, key: key } ), null );
        });

        // files
        var files = $.map(this.state.files, function(file){
            // check if we should render hidden files
            if (file.versions.length > 0) {
                var options = this.state.options;
                var latest = file.versions[file.versions.length - 1];

                if (!options.showDeletedFiles && latest.deleted) {
                    return false;
                }
            }

            // render the file
            var key = "file-" + file.name;
            return React.createElement( S3CFile, Object.assign( {}, props, { data: file, key: key } ) );
        }.bind(this));

        // upload control properties
        var uploadprops = $.extend({}, props, {
            "url": this.props.backend.getBucketURL(),
            "params": this.props.backend.getUploadParams(this.state.path),
            "iMaxFilesizeMB": this.props.iMaxFilesizeMB
        });

        var elements = [
            React.createElement( S3CBreadcrumbs, Object.assign( {}, props, { data: this.state.path } ), null ),
            React.createElement( S3COptionsControl, props, null ),
        ];

        Array.prototype.push.apply( elements, folders );
        Array.prototype.push.apply( elements, files );

        elements.push(
            React.createElement( S3CFolderForm, props, null ),
            React.createElement( S3CUploadForm, uploadprops, null )
        );

        // create the root element
        return React.createElement.apply( this, [ 'div', { className: this.props.style.container } ].concat( elements ) );
    },
});

module.exports = {
    S3CBreadcrumbs: S3CBreadcrumbs,
    S3COptionsControl: S3COptionsControl,
    S3CFolder: S3CFolder,
    S3CFileVersion: S3CFileVersion,
    S3CFile: S3CFile,
    S3CFolderForm: S3CFolderForm,
    S3CUploadForm: S3CUploadForm,
    S3Commander: S3Commander
    
}

