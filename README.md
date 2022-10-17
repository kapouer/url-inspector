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
  *optional* longer description, without title in it, and only the first line.

* site
  the name of the site, or the domain name

* mime
  RFC 7231 mime type of the resource (defaults to Content-Type)
  The inspected mime type could be more accurate than the http header.

* ext
  The file extension, only derived from the mime type.
  Safe to be used as file extension.

* what
  what the resource represents
  page, image, video, audio, file

* type
  how the resource is used:
  link, image, video, audio, embed.

  Example: if what:image and mime:text/html, and no html snippet is found, type will be 'link'.

* html
  the html representation of the resource, according to type and use.

* script
  url of a script that must be installed along with the html representation.

* date (YYYY-MD-DD format)
  creation or modification date

* author
  *optional* credit, author (without the @ prefix and with _ replaced by spaces)

* keywords
  *optional* array of collected keywords (lowercased words that are not in title words).

* size (number)
  *optional* Content-Length; discarded when type is embed

* icon
  *optional* link to the favicon of the site

* width, height (number)
  *optional* dimensions

* duration (hh:mm:ss string)
  *optional*

* thumbnail
  *optional* a URL to a thumbnail, could be a data-uri for embedded images

* source
  *optional* a URL that can go in a 'src' attribute; for example a resource can be an html page representing an image type.
  The URL of the image itself would be stored here; same thing for audio, video, embed types.

* error
  *optional* an http error code, or string

* all
  an object with all additional metadata that was found

Installation
------------

Besides `npm i url-inspector`:

* exiftool
* libcurl (and libcurl-dev if node-libcurl needs to be rebuilt)

Both programs are well-maintained, and available in most linux distributions.

API
---

```js
const inspector = require('url-inspector');

// options and their defaults
const opts = {
 all: false, // return all available non-normalized metadata
 ua: "Mozilla/5.0", // some oembed providers might not answer otherwise
 nofavicon: false, // disable any favicon-related additional request
 nosource: false, // disable any sub-source inspection for audio, video, image types
 // new in version 2.3.0
 file: true
};

// opts are optional

const obj = await inspector(url, opts);

```

By default oembed providers are

* found from a curated list of providers
* discovered in the inspected web pages

It is possible to add custom providers in the options, by passing
an array or a path to a module exporting an array:

```js
opts.providers = [{
  provider_name: "Custom OEmbed provider",
  endpoints: [{
   schemes: ["http:\\/\\/video\\.com\\/*"],
   builder(urlObj, obj) {
    // can see current obj and override arbitrary props
    obj.embed = "custom embed url";
   },
   redirect(urlObj, ret) {
    // can change inspected url - use rewrite to make internal changes
    urlObj.path = "/another/path";
    return true;
   }
  }]
 }];
```

Since providers can rewrite url, it is possible to only get the rewritten url:

```js
const urlObj = await inspector.prepare(url);
```

url-inspector uses node-libcurl to make http requests, and exposes it as:

```js
const req = await inspector.get(urlObj);
```

where `req.abort()` stops the request, `req.res` is the response stream,
and `res.statusCode`, `res.headers` are available.

Command-line client
-------------------

```shell
inspector-url <url>
inspector-url <filepath>
```

Some options are available through cli, like `--ua` to test user agents.

Proxies
-------

url-inspector configures http(s) proxies through proxy-from-env package
and environment variables (http_proxy, https_proxy, all_proxy, no_proxy):

Read [proxy-from-env documentation](https://github.com/Rob--W/proxy-from-env#environment-variables).

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
