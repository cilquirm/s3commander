/**
* S3 Commander
*
* Version: 0.3.10
* Authors: Alexandru Barbur, Eric Amador, Shaun Brady, Dean Kiourtsis,
*          Mike Liu, Brian Schott
*/

// isolate the jQuery API
(function($){
  "use strict";

  /************************************************************************
   * User Interface                                                       *
   ************************************************************************/

  var S3CBreadcrumbs = React.createClass({
    "render": function(){
      var crumbs = $.map(this.props.data.parts, function(part, i){
        var key = "crumb-" + i;
        return (
          <span key={key}>{part} /</span>
        );
      });

      return (
        <div className={this.props.style.control}>
          <span className="glyphicon glyphicon-hdd"></span>
          <span>/</span>
          {crumbs}
          <button
            className={this.props.style.button}
            onClick={this.props.onRefresh}>Refresh</button>
          <button
            className={this.props.style.button}
            onClick={this.props.onNavUp}>Up</button>
        </div>
      );
    },
  });

  var S3COptionsControl = React.createClass({
    "componentDidMount": function(){
      $(this.getDOMNode())
        .find("#chkShowDeleted")
        .bootstrapToggle({
          "size": "mini",
          "on": "On <span class='glyphicon glyphicon-asterisk'></span>&nbsp;",
        })
        .on('change', this.onShowDeletedChange);
    },
    "onShowDeletedChange": function(e){
      this.props.setStateOptions({
        "showDeletedFiles": $("#chkShowDeleted").prop("checked"),
      });
    },
    "render": function(){
      return (
        <div className={this.props.style.control}>
          <span>Show Deleted Files</span>
          <input
            type="checkbox"
            id="chkShowDeleted"
            defaultChecked={this.props.options.showDeletedFiles ? "checked" : ""} />
        </div>
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
      return (
        <div className={this.props.style.entry}>
          <span className="glyphicon glyphicon-folder-open"></span>
          <a onClick={this.onNav}>{this.props.data.name}</a>
          <button
            className={this.props.style.button}
            onClick={this.onDelete}>Delete</button>
        </div>
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
        <div {...props}>
          <span className="glyphicon glyphicon-trash"></span>
          <span>{data.modified.toString()}</span>
        </div>
      ) : (
        <div {...props}>
          <span className="glyphicon glyphicon-time"></span>
          <a onClick={this.onDownload}>{data.modified.toString()}</a>
        </div>
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

        return (
          <S3CFileVersion {...props} />
        );
      }.bind(this));

      // file control
      return (
        <div className={this.props.style.entry}>
          <span
            onClick={this.onDownload}
            className="s3icon glyphicon glyphicon-file">
          </span>
          <a
            className={this.props.style.link}
            onClick={this.onDownload}>{file.name}
          </a>

          {versions.length > 0 && this.getLatestVersion().deleted ? (
          <span className="glyphicon glyphicon-asterisk"></span>
          ) : (
          <button
            className={this.props.style.button}
            onClick={this.onDelete}>Delete</button>
          )}

          {versions.length > 0 ? (
          <button
            className={this.props.style.button}
            onClick={this.onToggleVersions}>Versions</button>
          ) : undefined}

          {this.state.showVersions ? versions : undefined}
        </div>
      );
    },
  });

  var S3CFolderForm = React.createClass({
    "onCreate": function(e){
      e.preventDefault();
      var name = this.refs.name.getDOMNode().value;
      this.props.onCreateFolder(name);
    },
    "render": function(){
      return (
        <form className={this.props.style.form}>
          <div className="form-group">
            <input type="text" className="form-control" ref="name" />
          </div>

          <button
            type="submit"
            className={this.props.style.button}
            onClick={this.onCreate}>Create</button>
        </form>
      );
    },
  });

  var S3CUploadForm = React.createClass({
    "componentWillMount": function(){
      // detect if we have dropzone support
      this.useDropzone = (typeof window.Dropzone !== 'undefined');
    },
    "componentDidMount": function(){
      // check if we're using dropzone
      if (!this.useDropzone) {
        // do nothing
        return;
      }

      // create the dropzone object
      var component = this;
      this.dropzone = new Dropzone(this.getDOMNode(), {
        "url": this.props.url,
        "init": function(){
          // enable uploading to folders by manipulating the S3 object key
          // TODO this is S3 specific and violates the backend/frontend barrier
          this.on("sending", function(file, xhr, formData){
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
          return;
        }

        var key = "param-" + name;
        return (
          <input type="hidden" name={name} value={value} key={key} />
        );
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

      // create components
      return (
        <form {...formprops}>
          {params}

          <span className="btn btn-primary fileinput-button dz-clickable">
            <i className="glyphicon glyphicon-plus"></i> Add files...
          </span>

          {this.useDropzone ? undefined : (
          <div className="form-group">
            <input type="file" name="file" />
          </div>
          )}

          {this.useDropzone ? undefined : (
          <button type="submit" className={this.props.style.button}>
            Upload
          </button>
          )}
        </form>
      );
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
        return (
          <S3CFolder {...props} data={folder} key={key} />
        );
      });

      // files
      var files = $.map(this.state.files, function(file){
        // check if we should render hidden files
        if (file.versions.length > 0) {
          var options = this.state.options;
          var latest = file.versions[file.versions.length - 1];

          if (!options.showDeletedFiles && latest.deleted) {
            return;
          }
        }

        // render the file
        var key = "file-" + file.name;
        return (
          <S3CFile {...props} data={file} key={key} />
        );
      }.bind(this));

      // upload control properties
      var uploadprops = $.extend({}, props, {
        "url": this.props.backend.getBucketURL(),
        "params": this.props.backend.getUploadParams(this.state.path),
        "iMaxFilesizeMB": this.props.iMaxFilesizeMB
      });

      // create the root element
      return (
        <div className={this.props.style.container}>
          <S3CBreadcrumbs {...props} data={this.state.path} />
          <S3COptionsControl {...props} />
          {folders}
          {files}
          <S3CFolderForm {...props} />
          <S3CUploadForm {...uploadprops} />
        </div>
      );
    },
  });

  /************************************************************************
   * jQuery Integration                                                   *
   ************************************************************************/

  // create an s3commander window
  $.fn.s3commander = function(options) {
    // resolve component options
    var opts = $.extend({}, $.fn.s3commander.defaults, options)

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
    React.render(
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

  /************************************************************************
  * Debug                                                                *
  ************************************************************************/

  // export objects
  window.Path = Path;

}(jQuery));
