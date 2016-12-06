/**
* S3 Commander
*
* Version: 0.3.10
* Authors: Alexandru Barbur, Eric Amador, Shaun Brady, Dean Kiourtsis,
*          Mike Liu, Brian Schott
*/

// configure sha1.js for RFC compliance
b64pad = "=";

/************************************************************************
 * Utility                                                              *
 ************************************************************************/

// Create a Path object.
function Path(sPath, bFolder) {
  sPath = typeof sPath !== 'undefined' ? sPath : "";
  bFolder = typeof bFolder !== 'undefined' ? bFolder : false;

  this.parts = sPath.split("/");
  this.folder = bFolder;
  this.normalize();
}

// Normalize the path components.
Path.prototype.normalize = function() {
  this.parts = this.parts.filter(function(part){
    return part.length > 0;
  });
};

// Get the string representation of the path.
Path.prototype.toString = function() {
  var uri = this.parts.join("/");
  if (this.folder && this.parts.length > 0) {
    uri += "/";
  }

  return uri;
};

// Create a deep copy of this object and return it.
Path.prototype.clone = function() {
  var other = new Path();
  other.parts = this.parts.slice();
  other.folder = this.folder;

  return other;
};

// Check if the path has no components.
Path.prototype.empty = function() {
  return this.parts.length == 0;
};

// Push one or more components to the end of the path.
Path.prototype.push = function(sPath) {
  var newparts = sPath.split("/");
  Array.prototype.push.apply(this.parts, newparts);

  this.folder = (newparts.length > 0 && sPath.substr(-1) == "/");
  this.normalize();

  return this;
};

// Pop one component from the end of the path.
Path.prototype.pop = function() {
  this.parts.pop();

  return this;
};

// Extend this path with another path.
Path.prototype.extend = function(pOther) {
  this.parts = this.parts.concat(pOther.parts);
  this.folder = pOther.folder;
  this.normalize();

  return this;
};

// Get a copy of this path extended with the other path.
Path.prototype.concat = function(pOther) {
  var result = new Path();
  result.parts = this.parts.concat(pOther.parts);
  result.folder = pOther.folder;

  return result;
};

// Get the last component of the path if available.
Path.prototype.basename = function(){
  if (this.parts.length == 0) {
    return undefined;
  }

  return this.parts[this.parts.length - 1];
};

// Make this path relative to the given one.
// Ex: new Path("foo/bar/xyz").rebase(new Path("foo")).toString() -> "bar/xyz"
Path.prototype.rebase = function(pOther) {
  var index = 0;
  while(index < pOther.parts.length) {
    if(this.parts[0] == pOther.parts[index]) {
      this.parts.shift();
      index++;
    }
    else {
      break;
    }
  }

  return this;
};

// Get the URI encoded string representation of the path.
Path.prototype.getURIEncoded = function() {
  // We want to encode the parts, but not the whole
  var enc_parts = this.parts.map(function(val) {
      return encodeURIComponent(val);
  });

  var uri = enc_parts.join("/");
  if (this.folder && this.parts.length > 0) {
    uri += "/";
  }

  return uri;
};
