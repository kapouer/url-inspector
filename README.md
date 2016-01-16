url-inspector
=============

Get metadata about any URL:

* mime  
  could be different from the Content-Type received from server
* type  
  video, audio, css, json, xml, html, data...
* size  
  either Content-Length or the size of the whole html document or zero
* name  
  could be the file name, the document title, the video or audio title, ...
* ext  
  the extension of the file, could be different from the one in the url
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

Using these tools:

* exiftool for getting media metadata
* quvi for getting online video metadata
* whacko for getting html metadata

API
---

```
var inspector = require('url-inspector');

var opts = {
	all: true // return all available metadata, could be big
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

