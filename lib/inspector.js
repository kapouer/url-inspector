var http = require('http');
var httpAgent = new http.Agent({});
var https = require('https');
var httpsAgent = new https.Agent({ rejectUnauthorized: false });
var URL = require('url');
var Path = require('path');
var ContentDisposition = require('content-disposition');
var BufferList = require('bl');
var moment = require('moment');
var MediaTyper = require('media-typer');
var dataUri = require('strong-data-uri');
var mime = require('mime');
var SAXParser = require('parse5').SAXParser;
var debug = require('debug')('url-inspector');
var OEmbedProviders = require('oembed-providers');
var CustomOEmbedProviders = require('./custom-oembed-providers');
var Streat = require('streat');
var iconv = require('iconv-lite');
var Cookie = require('tough-cookie').Cookie;

var streat = new Streat();
streat.start();

module.exports = inspector;

// maximum bytes to download for each type of data
var inspectors = {
	embed: [inspectEmbed, 10000],
	svg: [inspectSVG, 30000],
	image: [inspectMedia, 30000],
	audio: [inspectMedia, 200000],
	video: [inspectMedia, 100000],
	link: [inspectHTML, 150000],
	file: [inspectFile, 32000],
	archive: [inspectArchive, 0]
};

function inspector(url, opts, cb) {
	if (typeof opts == "function" && !cb) {
		cb = opts;
		opts = null;
	}
	if (!opts) {
		opts = {};
	}
	var obj = {
		url: encodeURI(url)
	};

	var urlObj = URL.parse(obj.url);

	var oEmbedUrl = opts.noembed ? {} : supportsOEmbed(urlObj, opts.providers);
	if (!oEmbedUrl.discovery && oEmbedUrl.url) {
		debug("oembed candidate");
		oEmbedUrl.obj = URL.parse(oEmbedUrl.url);
		obj.type = "embed";
		obj.mime = "text/html";
	}
	if (opts.noembed) obj.noembed = true;
	if (opts.error) obj.error = opts.error;
	urlObj.headers = {
		"User-Agent": opts.ua || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.63 Safari/537.36",
		"Accept-Encoding": "identity"
	};
	if (oEmbedUrl.obj) oEmbedUrl.obj.headers = Object.assign({}, urlObj.headers);
	request(oEmbedUrl.obj || urlObj, obj, function(err, obj, tags) {
		if (typeof oEmbedUrl == "function") {
			oEmbedUrl(urlObj, obj);
		}
		if (err) {
			if (oEmbedUrl.obj) {
				return inspector(url, Object.assign({noembed: true, error: err}, opts), cb);
			} else {
				return cb(err);
			}
		}
		if (!obj) return cb(400);
		if (!obj.site) {
			obj.site = urlObj.hostname;
		}
		normalize(obj);
		if (opts.all && tags) obj.all = tags;
		var urlFmt = URL.format(urlObj);
		if (obj.thumbnail) {
			obj.thumbnail = URL.resolve(urlFmt, obj.thumbnail);
		}
		if (obj.icon) {
			obj.icon = URL.resolve(urlFmt, obj.icon);
			cb(null, obj);
		} else if (obj.mime == "text/html") {
			var iconObj = {
				hostname: urlObj.hostname,
				port: urlObj.port,
				protocol: urlObj.protocol,
				pathname: '/favicon.ico',
				headers: Object.assign({}, urlObj.headers)
			};
			remoteExists(iconObj, function(yes) {
				if (yes) obj.icon = URL.format(iconObj);
				cb(null, obj);
			});
		} else {
			var iobj = {
				onlyfavicon: true
			};
			var urlObjRoot = {
				hostname: urlObj.hostname,
				port: urlObj.port,
				protocol: urlObj.protocol,
				headers: Object.assign({}, urlObj.headers)
			};
			debug("find favicon", urlObjRoot);
			request(urlObjRoot, iobj, function(err) {
				if (err) debug("favicon not found", err);
				if (iobj.icon) obj.icon = URL.resolve(URL.format(urlObjRoot), iobj.icon);
				cb(null, obj);
			});
		}
	});
}

function findEndpoint(url, list) {
	var endpoint;
	list.find(function(provider) {
		provider.endpoints.find(function(point) {
			if (!point.schemes) return;
			if (point.schemes.find(function(scheme) {
				var reg = scheme instanceof RegExp
					? scheme
					: new RegExp("^" + scheme.replace("*", ".*") + "$");
				return reg.test(url);
			})) {
				endpoint = point;
				return true;
			}
		});
	});
	return endpoint;
}

function supportsOEmbed(urlObj, providers) {
	var ret = {};
	var url = urlObj.href;
	var endpoint = providers && findEndpoint(url, providers);
	if (!endpoint) endpoint = findEndpoint(url, CustomOEmbedProviders);
	if (!endpoint) endpoint = findEndpoint(url, OEmbedProviders);
	if (!endpoint) {
		return ret;
	}
	if (endpoint.builder) {
		return endpoint.builder;
	}
	// request oembed endpoint
	var formatted = false;
	var epUrl = endpoint.url.replace('{format}', function() {
		formatted = true;
		return 'json';
	});
	var epUrlObj = URL.parse(epUrl, true);
	if (!formatted) epUrlObj.query.format = 'json';
	epUrlObj.query.url = url;
	delete epUrlObj.search;
	ret.url = URL.format(epUrlObj);
	ret.discovery = !!endpoint.discovery;
	return ret;
}

function remoteExists(urlObj, cb) {
	var opts = Object.assign({}, urlObj);
	opts.method = 'HEAD';
	var secure = /^https:?$/.test(urlObj.protocol);
	var req = (secure ? https : http).request(opts, function(res) {
		var status = res.statusCode;
		debug("remote", URL.format(urlObj), "returns", status);
		req.abort();
		if (status >= 200 && status < 400) return cb(true);
		else return cb(false);
	});
	req.end();
}

function request(urlObj, obj, cb) {
	if (!urlObj.href) urlObj.href = URL.format(urlObj);
	debug("request url", urlObj.href);
	var opts = Object.assign({}, urlObj);
	var secure = /^https:?$/.test(urlObj.protocol);
	opts.agent = secure ? httpsAgent : httpAgent;
	var req = (secure ? https : http).request(opts, function(res) {
		var status = res.statusCode;
		res.pause();
		debug("got response status %d", status);

		if (status < 200 || status >= 400) return cb(status);
		if (status >= 300 && status < 400 && res.headers.location) {
			req.abort();
			var location = URL.resolve(urlObj.href, res.headers.location);
			var redirObj = URL.parse(location);
			redirObj.headers = Object.assign({}, urlObj.headers);
			var cookies = replyCookies(res.headers['set-cookie']);
			if (cookies) redirObj.headers.cookie = cookies;
			redirObj.redirects = (urlObj.redirects || 0) + 1;
			if (redirObj.redirects >= 5) return cb("Too many http redirects");
			return request(redirObj, obj, cb);
		}

		var contentType = res.headers['content-type'];
		if (!contentType) contentType = mime.lookup(Path.basename(urlObj.pathname));
		var mimeObj = MediaTyper.parse(contentType);
		if (obj.type == "embed") {
			obj.mime = "text/html";
		} else {
			obj.mime = MediaTyper.format(mimeObj);
			obj.type = mime2type(mimeObj);
		}

		var contentLength = res.headers['content-length'];
		if (contentLength != null) {
			obj.size = parseInt(contentLength);
		}
		var disposition = res.headers['content-disposition'];
		if (disposition != null) {
			disposition = ContentDisposition.parse(disposition);
			if (disposition && disposition.parameters.filename) {
				urlObj = URL.parse(disposition.parameters.filename);
			}
		}
		if (obj.title == null && urlObj.path) obj.title = Path.basename(urlObj.path);

		debug("(mime, type, length) is (%s, %s, %d)", obj.mime, obj.type, obj.size);
		var charset = mimeObj.parameters && mimeObj.parameters.charset;
		if (charset) {
			charset = charset.toLowerCase();
			if (charset != "utf-8") {
				res = res.pipe(iconv.decodeStream(charset));
			}
		}
		var fun = inspectors[obj.type];
		pipeLimit(req, res, fun[1]);
		fun[0](obj, res, function(err, tags) {
			if (err) console.error(err);
			req.abort();
			// request oembed when
			// - not blacklisted (noembed)
			// - has already or has found a oembed url
			// - does not have a thumbnail or does not have an html embed code,
			var fetchEmbed = !obj.noembed && obj.oembed && (!obj.thumbnail || !obj.html);
			delete obj.noembed;
			if (fetchEmbed) {
				obj.type = "embed";
				// prevent loops
				obj.noembed = true;
				debug("fetch embed", obj.oembed);
				var urlObjEmbed = URL.parse(obj.oembed);
				urlObjEmbed.headers = Object.assign({}, urlObj.headers);
				request(urlObjEmbed, obj, cb);
			} else {
				cb(null, obj, tags);
			}
		});
	}).on('error', function(err) {
		return cb(err);
	});
	req.end();
}

function replyCookies(setCookies) {
	if (!setCookies) return;
	var cookies;
	if (Array.isArray(setCookies)) cookies = setCookies.map(Cookie.parse);
	else cookies = [Cookie.parse(setCookies)];
	return cookies.map(function(cookie) {
		return cookie.cookieString();
	});
}

function normalize(obj) {
	// remove all empty keys
	Object.keys(obj).forEach(function(key) {
		var val = obj[key];
		if (val == "" || val == null || (typeof val == 'number' && isNaN(val))) delete obj[key];
	});

	if (!obj.ext) {
		obj.ext = mime.extension(obj.mime);
	}
	obj.ext = obj.ext.toLowerCase();
	switch(obj.ext) {
		case "jpeg":
			obj.ext = "jpg";
			break;
		case "mpga":
			obj.ext = "mp3";
			break;
	}

	if (obj.duration) {
		obj.duration = formatDuration(moment.duration(obj.duration));
	}

	if (obj.description && obj.title) {
		obj.description = obj.description.replace(obj.title, "").trim();
	}

	if (obj.type == "embed") delete obj.size;

	if (obj.site.startsWith('@')) obj.site = obj.site.substring(1);
	obj.site = obj.site.toLowerCase();

	var alt = encodeURI(obj.title);

	if (!obj.html) {
		if (!obj.embed && obj.ext == "html") {
			if (obj.type == "image") {
				if (!obj.image) obj.type = 'link';
			} else if (obj.type == "audio") {
				if (!obj.audio) obj.type = 'link';
			} else if (obj.type == "video") {
				if (!obj.video) obj.type = 'link';
			}
		}
		if (obj.embed) {
			if (obj.type == "link") obj.type = 'embed';
			obj.html = `<iframe src="${obj.embed}"></iframe>`;
		} else  if (obj.type == "image") {
			obj.html = `<img src="${obj.image || obj.url}" alt="${alt}" />`;
		} else if (obj.type == "video") {
			obj.html = `<video src="${obj.video || obj.url}"></video>`;
		} else if (obj.type == "audio") {
			obj.html = `<audio src="${obj.audio || obj.url}"></audio>`;
		} else if (obj.type == "embed") {
			obj.html = `<iframe src="${obj.url}"></iframe>`;
		} else if (obj.type == "link") {
			obj.html = `<a href="${obj.url}">${obj.title}</a>`;
		} else if (obj.type == "file" || obj.type == "archive") {
			obj.html = `<a href="${obj.url}" target="_blank">${obj.title}</a>`;
		}
	}
	if (obj.image) {
		if (!obj.thumbnail) obj.thumbnail = obj.image;
		delete obj.image;
	}
	if (obj.audio) delete obj.audio;
	if (obj.video) delete obj.video;
	if (obj.oembed) delete obj.oembed;
}

function mime2type(obj) {
	var type = 'file';
	if (obj.subtype == "html") {
		type = 'link';
	} else if (obj.subtype == 'svg') {
		type = 'svg';
	} else if (['image', 'audio', 'video'].indexOf(obj.type) >= 0) {
		type = obj.type;
	} else if (['x-xz', 'x-gtar', 'x-gtar-compressed',
	'x-tar', 'gzip', 'zip'].indexOf(obj.subtype) >= 0) {
		type = 'archive';
	}
	return type;
}

function pipeLimit(req, res, length) {
	if (!length) return req.abort();
	var curLength = 0;
	res.on('data', function(buf) {
		curLength += buf.length;
		if (curLength >= length) {
			debug("got %d bytes, aborting", curLength);
			req.abort();
		}
	});
}

function importTags(tags, obj, map) {
	var val, tag, itag, key;
	for (var tag in tags) {
		val = tags[tag];
		if (val == null) continue;
		itag = tag.toLowerCase();
		key = map ? map[itag] : itag;
		if (key === undefined) continue;
		delete tags[tag];
		obj[key] = val;
	}
}

function formatDuration(mom) {
	return moment(mom._data).format('HH:mm:ss');
}

function inspectHTML(obj, res, cb) {
	// collect tags
	var selectors = {
		title: {
			text: "title"
		},
		link: {
			rel: {
				icon: "icon",
				'shortcut icon': "icon",
			},
			type: {
				"application/json+oembed": "oembed",
				"text/json+oembed": "oembed"
			}
		},
		meta: {
			property: {
				'og:title': "title",
				'og:description': "description",
				'og:image': "image",
				'og:audio': "audio",
				'og:video': "video",
				'og:url': "url",
				'og:type': "type",
				'og:site_name': "site",
				'og:video:url': "embed",
				'og:audio:url': "embed"
			},
			name: {
				'twitter:title': "title",
				'twitter:description': "description",
				'twitter:image': "thumbnail",
				'twitter:url': "url",
				'twitter:site': "site",
				'twitter:type': "type"
			},
			itemprop: {
				name: "title",
				description: "description",
				duration: "duration",
				image: "image", // give priority to thumbnailurl when defined on same node
				thumbnailurl: "thumbnail",
				embedurl: "embed",
				width: "width",
				height: "height"
			}
		}
	};

	var parser = new SAXParser();
	var tags = {};
	var priorities = {};
	var curText, curKey, curPriority;
	var curSchemaType, curSchemaLevel;
	var firstSchemaType, firstSchemaLevel;
	var curLevel = 0;
	var embedType;

	parser.on('startTag', function(name, attributes, selfClosing) {
		name = name.toLowerCase();
		if (name == "meta" || name =="link") selfClosing = true;
		if (!selfClosing) curLevel++;
		var key, nkey, atts, val, curatt;
		var selector = selectors[name];
		if (selector && selector.text) {
			key = selector.text;
		} else {
			atts = hashAttributes(attributes);
			val = atts.itemtype;
			if (val) {
				if (curSchemaType && curSchemaLevel < curLevel) {
					debug("ignoring lower level schema", curSchemaType, curSchemaLevel, curLevel);
					return;
				}
				if (/\/.*(Action|Event|Page|Site|Type|Status|Audience)$/.test(val)) return;
				debug("schema type", val);
				// the page can declares several itemtype
				// the order in which they appear is important
				// nonWebPage + embedType -> ignore embedType
				// WebPage (or nothing) + embedType -> embedType is the type of the page
				curSchemaType = val;
				curSchemaLevel = curLevel;
				if (!firstSchemaType) {
					firstSchemaType = curSchemaType;
					firstSchemaLevel = curSchemaLevel;
					tags.type = val;
				}
				return;
			}
			if (atts.itemprop) {
				name = 'meta';
				selector = selectors.meta;
			}
		}
		if (!selector) return;
		if (!key) for (curatt in selector) {
			nkey = atts[curatt];
			if (nkey) {
				nkey = selector[curatt][nkey.toLowerCase()];
				if (nkey) key = nkey;
			}
		}
		if (!key) return;
		var mkey, priority = 1;
		if (name == "meta") {
			mkey = 'content';
			priority = 3;
		} else if (name == "link") {
			mkey = 'href';
			priority = 2;
		} else if (!selfClosing) {
			curKey = key;
			curText = "";
			return;
		}
		curPriority = priority;
		val = atts[mkey];
		debug("Tag", name, "has key", key, "with priority", priority, "and value", val, "in attribute", mkey);
		if (mkey && val && (!priorities[key] || priority > priorities[key])) {
			priorities[key] = priority;
			tags[key] = val;
			if (key == "icon" && obj.onlyfavicon) {
				finish();
			}
		}
	});
	parser.on('text', function(text) {
		if (curText != null) curText += text;
	});
	parser.on('endTag', function(name) {
		if (curSchemaLevel == curLevel) {
			// we finished parsing the content of an embedded Object, abort parsing
			curSchemaLevel = null;
			curSchemaType = null;
			return finish();
		}
		curLevel--;
		if (curText != null && (!priorities[curKey] || curPriority > priorities[curKey])) {
			debug("Tag", name, "has key", curKey, "with text content", curText);
			tags[curKey] = curText;
		}
		curText = null;
		curKey = null;
	});


	res.once('end', finish);

	var finished = false;
	function finish() {
		if (finished) return;
		finished = true;
		parser.stop();
		var type = tags.type;
		if (type) {
			if (/(^|\/|:)(video|movie)/i.test(type)) type = 'video';
			else if (/(^|\/|:)(audio|music)/i.test(type)) type = 'audio';
			else if (/(^|\/|:)(image|photo)/i.test(type)) type = 'image';
			else type = null;
			if (type) obj.type = type;
			delete tags.type;
		}
		Object.assign(obj, tags);
		cb();
	}

	res.pipe(parser);
}

function hashAttributes(list) {
	var i, att, obj = {};
	for (i = 0; i < list.length; i++) {
		att = list[i];
		if (att.value) obj[att.name.toLowerCase()] = att.value;
	}
	return obj;
}

function inspectEmbed(obj, res, cb) {
	res.pipe(BufferList(function(err, data) {
		if (err) return cb(err);
		var tags;
		try {
			tags = JSON.parse(data.toString());
		} catch(ex) {
			if (ex) return cb(ex);
		}
		importTags(tags, obj, {
			type: 'type',
			title: 'title',
			thumbnail_url: 'thumbnail',
			width: 'width',
			height: 'height',
			html: 'html',
			url: 'url',
			provider_name: 'site'
		});
		if (obj.type == "photo") obj.type = "image";
		else if (obj.type == "rich") obj.type = "embed";
		cb(null, tags);
	}));
}

function inspectSVG(obj, res, cb) {
	var parser = new SAXParser();
	parser.on('startTag', function(name, atts, selfClosing) {
		if (name != "svg") return;
		obj.type = "image";
		var box = atts.find(function(att) {
			return att.name.toLowerCase() == "viewbox";
		}).value;
		if (!box) return cb();
		var parts = box.split(/\s+/);
		if (parts.length == 4) {
			obj.width = parseFloat(parts[2]);
			obj.height = parseFloat(parts[3]);
		}
		cb();
	});
	res.pipe(parser);
}

function inspectMedia(obj, res, cb) {
	streat.run(res, function(err, tags) {
		if (err) return cb(err);
		importTags(tags, obj, {
			imagewidth: 'width',
			imageheight: 'height',
			duration: 'duration',
			mimetype: 'mime',
			extension: 'ext',
			title: 'title',
			artist: 'artist',
			album: 'album',
			objectname: 'title',
			audiobitrate: 'bitrate',
			creator: 'credit',
			credit: 'credit'
		});
		if (!obj.thumbnail && tags.Picture && tags.PictureMIMEType) {
			obj.thumbnail = dataUri.encode(
				new Buffer(tags.Picture.replace(/^base64:/, ''), 'base64'),
				tags.PictureMIMEType
			);
		}
		if (obj.bitrate && !obj.duration) {
			var rate = parseInt(obj.bitrate) * 1000 / 8;
			obj.duration = moment.duration(parseInt(obj.size / rate), 'seconds');
		}
		delete obj.bitrate;
		if (obj.title && obj.artist && obj.title.indexOf(obj.artist) < 0) {
			obj.title = obj.title + ' - ' + obj.artist;
			delete obj.artist;
		}
		// copy to be able to serialize to JSON
		cb(null, tags);
	});
}

function inspectFile(obj, res, cb) {
	streat.run(res, function(err, tags) {
		if (err) return cb(err);
		importTags(tags, obj, {
			mimetype: 'mime',
			extension: 'ext',
			filetypeextension: 'ext',
			title: 'title'
			//,pagecount: 'pages'
		});
		cb(null, tags);
	});
}

function inspectArchive(obj, res, cb) {
	cb(null, obj);
}

