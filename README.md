url-inspector
=============

Get metadata about any URL:

* mime  
* type  
  video, audio, css, json, xml, html, data...
* size  
  either Content-Length or the size of the whole html document or zero
* name  
  could be the file name, the document title, the video or audio title, ...
* width, height  
  *optional* dimensions
* duration  
  *optional*
* thumbnail  
  *optional* a URL to a thumbnail. Could be a data-uri.


API
---

```
var inspector = require('url-inspector')({
	display: ':0',
	width: 120,
	height: 90
});

inspector(url, function(err, meta) {

});
```

Command-line client
-------------------

inspector-url <url>


License
-------

See LICENSE.

