url-inspector
=============

Get metadata about any URL,
using http headers, exiftool, dom inspection, oembed, opengraph, twitter cards, schema.org.

This is a node.js module.


* name  
  the last component of the url, including the query string

* site  
  the name of the site, or the domain name

* mime  
  the inspected mime type of the resource - could differ from server Content-Type

* type  
  what the resource represents  
  image, video, audio, link, file, embed, archive

* html  
  a canonical html representation of the full resource,  
  depending on the type and mime, could be img, a, video, audio, iframe tag.

* size  
  *optional* Content-Length of the resource

* favicon  
  *optional* link to the favicon of the site

* title  
  *optional* the title found in the resource

* width, height  
  *optional* dimensions

* duration  
  *optional*

* thumbnail  
  *optional* a URL to a thumbnail

* sample  
  *optional* short string extracted from the beginning of the data, could be
  used to represent the data itself. Archives might list some of their files
  in here.

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

