url-inspector
=============

Synopsys
--------

```sh
npx url-inspector <url>
```

Description
-----------

Get normalized metadata about what a URL mainly represents.

This is a Node.js module.

Sources of information:

- HTTP response headers
- embedded tags in binary formats (using exiftool)
- OpenGraph, Twitter Cards, schema.org, json+ld, title and meta tags in HTML pages
- oEmbed endpoints
- if a URL is mainly wrapping a media, that media might be inspected too

Inspection stops when enough information has been gathered, or when a maximum number of bytes (depending on media type) have been downloaded.

Format
------

- url:
  url of the inspected resource
- title:
  title of the resource, or filename, or last component of pathname with query
- description:
  *optional* longer description, without title in it, and only the first line.
- site:
  the name of the site, or the domain name
- mime:
  RFC 7231 mime type of the resource (defaults to Content-Type)
  The inspected mime type could be more accurate than the http header.
- ext:
  The file extension, only derived from the mime type.
  Safe to be used as file extension.
- what:
  what the resource represents
  page, image, video, audio, file
- type:
  how the resource is used:
  link, image, video, audio, embed.
  Example: if what:image and mime:text/html, and no html snippet is found, type will be 'link'.
- html:
  the html representation of the resource, according to type and use.
- script:
  url of a script that must be installed along with the html representation.
- date (YYYY-MD-DD format)
  creation or modification date
- author:
  *optional* credit, author (without the @ prefix and with _ replaced by spaces)
- keywords:
  *optional* array of collected keywords (lowercased words that are not in title words).
- size:
  *optional* Content-Length as integer; discarded when type is embed
- icon:
  *optional* link to the favicon of the site
- width, height:
  *optional* dimensions as integers
- duration:
  *optional* hh:mm:ss string
- thumbnail:
  *optional* a URL to a thumbnail, could be a data-uri for embedded images
- source:
  *optional* a URL that can go in a 'src' attribute; for example a resource can be an html page representing an image type.
  The URL of the image itself would be stored here; same thing for audio, video, embed types.
- error:
  *optional* an http error code, or string

Install
-------

url-inspector currently requires those external libraries/tools:

- exiftool
- libcurl (and libcurl-dev if node-libcurl needs to be rebuilt)

Both programs are well-maintained, and available in most linux distributions.

Usage
-----

```js
const Inspector = require('url-inspector');

const opts = {
 ua: "Mozilla/5.0", // override ua, defaults to somewhat modern browser
 nofavicon: false, // disable additional requests to get a favicon
 nosource: false, // disable main embedded media sub-inspection
 file: true, // local files inspection is only enabled by default when using CLI
 meta: {} // user-entered metadata, to be merged and normalized
 providers: null // custom providers (module path or array)
};

const inspector = new Inspector(opts);

const obj = await inspector.lookup(url);

```

Inspector throws http-errors instances.

By default oembed providers are

- found from a curated list of providers
- found from a custom list, required from opts.providers
- discovered in the inspected web pages

It is possible to add custom providers in the options, by passing
an array or a path to a module exporting an array.

See `src/custom-oembed-providers.js` for examples.

To pass an incomplete metadata object to further inspect, do

```js
await inspector.lookup(obj); // where obj.url is set
```

To normalize an already existing metadata object, including url rewriting done by providers, and other changes in fields, do:

```js
await inspector.normalize(obj);
```

url-inspector uses node-libcurl to make http requests, and exposes it as:

```js
const req = await Inspector.get(urlObj);
```

where `req.abort()` stops the request, `req.res` is the response stream,
and `res.statusCode`, `res.headers` are available.

Proxy support
-------------

url-inspector configures http(s) proxies through proxy-from-env package
and environment variables (http_proxy, https_proxy, all_proxy, no_proxy):

Read [proxy-from-env documentation](https://github.com/Rob--W/proxy-from-env#environment-variables).

License
-------

Open Source, see ./LICENSE.
