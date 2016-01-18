url-inspector
=============

Get metadata about any URL:

* name  
  the file name
* ext  
  the inspected (lowercased) extension of the resource - could differ from URL
* size  
  either Content-Length or the size of the whole html document or zero if unknown
* mime  
  the inspected mime type of the resource - could differ from server Content-Type
* type  
  what the resource represents  
  image, video, audio, link, file, embed
* html  
  a canonical html representation of the full resource,  
  depending on the type and mime, could be img, a, video, audio, iframe tag.
* title  
  *optional*
* favicon  
  *optional* link to the favicon of the site
* width, height  
  *optional* dimensions
* duration  
  *optional*
* thumbnail  
  *optional* a URL to a thumbnail
* sample  
  *optional* short string extracted from the beginning of the data
* all  
  an object with all additional metadata that was found


Installation
------------

```
npm install url-inspector
```

Add `-g` switch to install the executable.

exiftool executable must be available.

A package is available for debian/ubuntu: libimage-exiftool-perl
and for fedora: perl-Image-ExifTool.
Otherwise it is installable from
http://owl.phy.queensu.ca/~phil/exiftool/


API
---

```
var inspector = require('url-inspector');

var opts = {
	all: true // return all available non-normalized metadata
};

inspector(url, opts, function(err, obj) {

});

// or simply

inspector(url, function(err, obj) {...});

```

Command-line client
-------------------

```
inspector-url <url>
```

License
-------

See LICENSE.

