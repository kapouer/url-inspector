url-inspector
=============

Get metadata about any URL.

Limited memory and network usage.

This is a node.js module.

It returns and normalizes information found in http headers or in the resource
itself using exiftool (which knows almost everything about files but html),
or a sax parser to read oembed, opengraph, twitter cards, schema.org attributes
or standard html tags.

Both tools stop inspection when they gathered enough tags, or stop when a max number
of bytes (depending on media type) have been downloaded.

A [demo](http://inspector.eda.sarl) using this module is available,
with [url-inspector-daemon](http://github.com/kapouer/url-inspector-daemon)

* url
  url of the inspected resource

* title
  title of the resource, or filename, or last component of pathname with query

* description
  *optional* longer description, without title in it

* site
  the name of the site, or the domain name

* mime
  RFC 7231 mime type of the resource (defaults to Content-Type)
  The inspected mime type could be more accurate than the http header.

* ext
  the extension matching the mime type (not the file extension)

* type
  what the resource represents
  image, video, audio, link, file, embed, archive

* html
  a canonical html representation of the full resource,
  depending on the type and mime, could be img, a, video, audio, iframe tag.

* date
  creation or modification date in YYYY-MM-DD format

* author
  credit, author...

* size
  *optional* Content-Length; discarded when type is embed

* icon
  *optional* link to the favicon of the site

* width, height
  *optional* dimensions

* duration
  *optional*

* thumbnail
  *optional* a URL to a thumbnail, could be a data-uri for embedded images

* source
  *optional* a URL that can go in a 'src' attribute; for example a resource can
  be an html page representing an image type. The URL of the image itself would
  be stored here; same thing for audio, video, embed types.

* error
  *optional* an http error code, or string

* all
  an object with all additional metadata that was found

Installation
------------

```shell
npm install url-inspector
```

Add `-g` switch to install the executable.

exiftool executable must be available:

* a package is available for debian/ubuntu: libimage-exiftool-perl
and for fedora: perl-Image-ExifTool.
* Otherwise it is installable from [exiftool](http://owl.phy.queensu.ca/~phil/exiftool/)

API
---

```js
var inspector = require('url-inspector');

var opts = {
 all: false, // return all available non-normalized metadata
 ua: "Mozilla/5.0", // some oembed providers might not answer otherwise
 nofavicon: false, // disable any favicon-related additional request
 nosource: false, // disable any sub-source inspection for audio, video, image types
 providers: [{ // an array of custom OEmbed providers, or path to a module exporting such an array
  provider_name: "Custom OEmbed provider",
  endpoints: [{
   schemes: ["http:\/\/video\.com\/*"],
   builder(urlObj, obj) {
    // can see current obj and override arbitrary props
    obj.embed = "custom embed url";
   },
      redirect(urlObj, ret) {
        // can change inspected url
        urlObj.path = "/another/path";
      }
  }]
 }],
 // new in version 2.3.0
 file: true
};

inspector(url, opts, function(err, obj) {

});

// or simply

inspector(url, function(err, obj) {...});

```

Command-line client
-------------------

```shell
inspector-url <url>
inspector-url <filepath>
```

Low resource usage
------------------

network:

* a maximum of several hundreds of kilobytes (depending on resource type) is downloaded
  but it is usually much less, depending on connection speed.
* inspection stops as soon as enough metadata is gathered

memory: html is inspected using a sax parser, without building a full DOM.

exiftool: runs using `streat` module, which keeps exiftool always open for performance

Since version 2.3.0, file:// protocol is supported through cli by default,
or setting "file" flag to true (false by default) through api.

License
-------

See LICENSE.

See also
--------

<https://github.com/kapouer/url-inspector-daemon>

<https://github.com/kapouer/node-streat>
