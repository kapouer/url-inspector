const http = require('http');
const httpAgent = new http.Agent({});
const https = require('https');
const httpsAgent = new https.Agent({
	rejectUnauthorized: false
});
const URL = require('url');
const Path = require('path');
const ContentDisposition = require('content-disposition');
const BufferList = require('bl');
const { DateTime, Duration } = require('luxon');
const MediaTyper = require('media-typer');
const dataUri = require('strong-data-uri');
const mime = require('mime');
const SAXParser = require('parse5-sax-parser');
const debug = require('debug')('url-inspector');
const OEmbedProviders = require('@kapouer/oembed-providers');
const CustomOEmbedProviders = require('./custom-oembed-providers');
const Streat = require('streat');
const iconv = require('iconv-lite');
const Cookie = require('tough-cookie').Cookie;
const fs = require('fs');
const { decodeHTML } = require('entities');

const streat = new Streat();
streat.start();

module.exports = inspector;

// maximum bytes to download for each type of data
var inspectors = {
	embed: [inspectEmbed, 10000],
	svg: [inspectSVG, 30000],
	image: [inspectMedia, 30000, 0.1],
	audio: [inspectMedia, 200000, 0.1],
	video: [inspectMedia, 100000, 0.1],
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
		url: URL.format(URL.parse(url))
	};

	var urlObj = URL.parse(obj.url);
	if (urlObj.protocol == "file:") {
		if (!opts.file) {
			// eslint-disable-next-line no-console
			console.warn("file: protocol is disabled");
			return cb(400);
		}
		opts.nofavicon = true;
		urlObj.pathname = obj.url.substring(7);
	}
	urlObj.headers = {};
	var oEmbedUrl = opts.noembed ? {} : supportsOEmbed(urlObj, opts.providers);

	requestPageOrEmbed(urlObj, oEmbedUrl, obj, opts, function (err, obj, tags) {
		if (err) return cb(err);
		if (!obj) return cb(400);

		if (!obj.site) {
			obj.site = urlObj.hostname;
		}
		obj.pathname = urlObj.pathname;

		cb = sourceInspection(obj, opts, cb);

		var urlFmt = URL.format(urlObj);
		if (obj.thumbnail) {
			obj.thumbnail = URL.resolve(urlFmt, obj.thumbnail);
		}

		normalize(obj);

		if (opts.all && tags) obj.all = tags;

		if (obj.icon) {
			obj.icon = URL.resolve(urlFmt, obj.icon);
			cb(null, obj);
		} else if (opts.nofavicon) {
			cb(null, obj);
		} else if (obj.ext == "html") {
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
			if (obj.reference) {
				// another url for the same object
				urlObj = URL.parse(obj.reference);
				obj.site = urlObj.hostname;
				delete obj.reference;
			}
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

function requestPageOrEmbed(urlObj, embedObj, obj, opts, cb) {
	if (!embedObj.discovery && embedObj.url) {
		debug("oembed candidate");
		embedObj.obj = URL.parse(embedObj.url);
		obj.type = "embed";
		obj.mime = "text/html";
	}
	if (opts.noembed) obj.noembed = true;
	if (opts.error) obj.error = opts.error;
	urlObj.headers = Object.assign({
		"User-Agent": opts.ua || "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"Accept-Encoding": "identity",
		"Accept": "*/*"
	}, urlObj.headers);
	if (embedObj.obj) embedObj.obj.headers = Object.assign({}, urlObj.headers);
	const actualObj = embedObj.obj || urlObj;
	request(actualObj, obj, function (err, robj, tags) {
		if (err) {
			if (embedObj.obj) {
				return inspector(urlObj.href, Object.assign({ noembed: true, error: err }, opts), cb);
			} else if (embedObj.url) {
				embedObj.discovery = false;
				return requestPageOrEmbed({}, embedObj, obj, opts, cb);
			} else {
				return cb(err);
			}
		}
		if (typeof embedObj.builder == "function") {
			embedObj.builder(urlObj, robj);
		}
		cb(null, robj, tags);
	});
}

function sourceInspection(obj, opts, cb) {
	if (opts.nosource || !obj.source || obj.ext != "html" || obj.source == obj.url || /video|audio|image/.test(obj.type) == false) return cb;
	var urlObj = URL.parse(obj.source);
	if (!urlObj.pathname || !Path.extname(urlObj.pathname)) return cb;
	debug("source inspection", obj.mime, obj.type, obj.source);
	return function(err, obj) {
		if (err) return cb(err, obj);
		opts = Object.assign({}, opts);
		if (obj.icon) opts.nofavicon = true;
		opts.nosource = true;
		inspector(obj.source, opts, function(err, sourceObj) {
			if (err) {
				debug("Error fetching subsource", err);
				return cb(null, obj);
			}
			if (sourceObj.type != obj.type) return cb(null, obj);
			obj.source = sourceObj.url;
			['mime', 'ext', 'type', 'size', 'width', 'height', 'duration'].forEach(function(key) {
				if (sourceObj[key]) obj[key] = sourceObj[key];
			});
			cb(null, obj);
		});
	};
}

function findEndpoint(url, list) {
	var endpoint;
	list.find(function(provider) {
		provider.endpoints.find(function(point) {
			if (!point.schemes) return;
			if (point.schemes.find(function(scheme) {
				var reg = scheme instanceof RegExp
					? scheme
					: new RegExp("^" + scheme.replace(/\*/g, ".*") + "$");
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
	if (typeof providers == "string") {
		// try to require it
		try {
			providers = require(providers);
		} catch(ex) {
			// eslint-disable-next-line no-console
			console.error("url-inspector missing providers:", providers);
		}
	}
	var endpoint = providers && findEndpoint(url, providers);
	if (!endpoint) endpoint = findEndpoint(url, CustomOEmbedProviders);
	if (!endpoint) endpoint = findEndpoint(url, OEmbedProviders);
	if (!endpoint) {
		return ret;
	}
	if (endpoint.builder) ret.builder = endpoint.builder;
	debug("Found oembed provider", endpoint);
	if (typeof endpoint.redirect == "function") {
		var redirection = endpoint.redirect(urlObj, ret);
		if (redirection) {
			debug("provider makes a redirection");
			return ret;
		}
	}
	// request oembed endpoint
	var formatted = false;
	if (endpoint.url) {
		var epUrl = endpoint.url.replace('{format}', function () {
			formatted = true;
			return 'json';
		});
		var epUrlObj = URL.parse(epUrl, true);
		if (!formatted) epUrlObj.query.format = 'json';
		epUrlObj.query.url = url;
		delete epUrlObj.search;
		ret.url = URL.format(epUrlObj);
	}
	ret.discovery = !!endpoint.discovery;
	debug("OEmbed config", ret);
	return ret;
}

function remoteExists(urlObj, cb) {
	var opts = Object.assign({}, urlObj);
	opts.method = 'HEAD';
	var secure = /^https:?$/.test(urlObj.protocol);
	if (opts.pathname && !opts.path) opts.path = opts.pathname;
	var req = (secure ? https : http).request(opts, function(res) {
		var status = res.statusCode;
		debug("remote", URL.format(urlObj), "returns", status);
		req.abort();
		if (status == 204 || res.headers['Content-Length'] == 0) return cb(false);
		else if (status >= 200 && status < 400) return cb(true);
		else return cb(false);
	});
	req.end();
}

function request(urlObj, obj, cb) {
	if (!urlObj.href) urlObj.href = URL.format(urlObj);
	debug("request url", urlObj.href);

	doRequest(urlObj, function(err, req, res) {
		if (err) return cb(err);
		var status = res.statusCode;
		res.pause();
		debug("got response status %d", status);

		if (status < 200 || (status >= 400 && status < 600)) {
			// definitely an error - status above 600 could be an anti-bot system
			return cb(status);
		}
		if (status >= 300 && status < 400 && res.headers.location) {
			req.abort();
			var location = URL.resolve(urlObj.href, res.headers.location);
			debug("to location", location);
			var redirObj = URL.parse(location);
			redirObj.headers = Object.assign({}, urlObj.headers);
			var cookies = replyCookies(res.headers['set-cookie'], redirObj.headers.Cookie);
			if (cookies) {
				debug("replying with cookie", cookies);
				redirObj.headers.Cookie = cookies;
			}
			redirObj.redirects = (urlObj.redirects || 0) + 1;
			if (redirObj.redirects >= 5) return cb("Too many http redirects");
			return request(redirObj, obj, cb);
		}

		var contentType = res.headers['content-type'];

		if (!contentType) contentType = mime.getType(Path.basename(urlObj.pathname));
		var mimeObj = MediaTyper.parse(contentType);
		if (obj.type == "embed") {
			obj.mime = "text/html";
		} else {
			obj.mime = MediaTyper.format(mimeObj);
			if (obj.mime) obj.mime = obj.mime.toLowerCase();
			obj.type = mime2type(mimeObj);
		}

		var contentLength = res.headers['content-length'];
		if (contentLength != null) {
			obj.size = parseInt(contentLength);
		}
		var disposition = res.headers['content-disposition'];
		if (disposition != null) {
			debug("got content disposition", disposition);
			if (disposition.startsWith('filename=')) disposition = 'attachment; ' + disposition;
			try {
				disposition = ContentDisposition.parse(disposition);
			} catch(ex) {
				debug("Unknown Content-Disposition format", ex);
			}
			if (disposition && disposition.parameters.filename) {
				urlObj = URL.parse(disposition.parameters.filename);
			}
		}
		if (obj.title == null && urlObj.path) {
			obj.title = lexize(Path.basename(urlObj.path));
		}

		debug("(mime, type, length) is (%s, %s, %d)", obj.mime, obj.type, obj.size);
		var charset = mimeObj.parameters && mimeObj.parameters.charset;
		if (charset) {
			charset = charset.toLowerCase();
			if (charset != "utf-8") {
				res = res.pipe(iconv.decodeStream(charset));
			} else {
				res.setEncoding(charset);
			}
		} else if (mimeObj.type == "text" || mimeObj.subtype == "svg" || mimeObj.suffix == "xml") {
			res.setEncoding("utf-8");
		}
		var fun = inspectors[obj.type];
		if (urlObj.protocol != "file:") pipeLimit(req, res, fun[1], fun[2]);
		fun[0](obj, res, function(err, tags) {
			if (err) {
				// eslint-disable-next-line no-console
				console.error(err);
			}
			req.abort();
			// request oembed when
			// - not blacklisted (noembed)
			// - has already or has found a oembed url
			// - does not have a thumbnail or does not have an html embed code,
			var fetchEmbed = !obj.noembed && obj.oembed && (!obj.thumbnail || !obj.html);
			delete obj.noembed;
			var canon = obj.canonical;
			if (canon) {
				canon = URL.parse(canon);
				canon.redirects = (urlObj.redirects || 0) + 1;
			}
			delete obj.canonical;
			if (fetchEmbed) {
				obj.type = "embed";
				// prevent loops
				obj.noembed = true;
				debug("fetch embed", obj.oembed);
				var urlObjEmbed = URL.parse(obj.oembed);
				urlObjEmbed.headers = Object.assign({}, urlObj.headers);
				if (urlObj.protocol) urlObjEmbed.protocol = urlObj.protocol;
				request(urlObjEmbed, obj, cb);
			} else if (canon && canon.redirects < 5 && canon.pathname != urlObj.pathname && canon.pathname + '/' != urlObj.pathname && canon.pathname != urlObj.pathname + '/') {
				debug("fetch canonical url", canon.href);
				canon.headers = Object.assign({}, urlObj.headers);
				request(canon, obj, function(err, cobj, ctags) {
					if (err) return cb(null, obj, tags);
					else return cb(null, cobj, ctags);
				});
			} else {
				cb(null, obj, tags);
			}
		});
	});
}

function doRequest(urlObj, cb) {
	var req;
	if (urlObj.protocol == "file:") {
		fs.stat(urlObj.pathname, function(err, stat) {
			if (err) return cb(err);
			try {
				req = fs.createReadStream(urlObj.pathname).on('error', cb);
			} catch(err) {
				cb(err);
				return;
			}
			if (!req.abort) req.abort = req.destroy;
			req.headers = {
				'content-length': stat.size.toString()
			};
			req.local = true;
			cb(null, req, req);
		});
	} else {
		var opts = Object.assign({}, urlObj);
		var secure = /^https:?$/.test(urlObj.protocol);
		opts.agent = secure ? httpsAgent : httpAgent;
		if (opts.pathname && !opts.path) opts.path = opts.pathname;

		try {
			req = (secure ? https : http).request(opts, function(res) {
				cb(null, req, res);
			}).on('error', function(err) {
				if (err.code == "ECONNRESET" && opts.headers['User-Agent'].includes("Googlebot")) {
					// suspicion of User-Agent sniffing
					debug("ECONNRESET, trying bot-less ua");
					opts.headers = Object.assign(opts.headers, {
						"User-Agent": "Mozilla/5.0 (compatible)"
					});
					doRequest(opts, cb);
				} else {
					cb(err);
				}
			});
			req.end();
		} catch(err) {
			cb(err);
			return;
		}
	}
}

function lexize(str) {
	var list = [];
	var parts = str.split('.');
	if (parts.length > 1) {
		var ext = parts.pop();
		if (ext.length <= 4) str = parts.join(' ');
	}

	str.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').split(' ').forEach(function(word) {
		// throw only digits
		if (/^\d+$/.test(word)) return;
		// allow words with some digits and some letters
		if (/^\d{1,6}[a-zA-Z]{1,4}$/.test(word)) {
			// pass
		} else if (/[a-zA-Z]+\d+/.test(word)) {
			// throw words with digits in the middle or the end
			return;
		}

		// throw words of length <= 2
		if (word.length <= 1) return;
		list.push(word);
	});
	// but consider it a failure if result has small length or is empty
	if (list.length) {
		var newstr = list.join(' ');
		if (newstr.length <= 1) return str;
		return newstr;
	} else {
		return str;
	}
}

function replyCookies(setCookies, prev) {
	if (!setCookies) return prev;
	var cookies;
	if (Array.isArray(setCookies)) cookies = setCookies.map(Cookie.parse);
	else cookies = [Cookie.parse(setCookies)];
	cookies = cookies.map(function(cookie) {
		return cookie.cookieString();
	});
	if (prev) prev.split('; ').forEach(function(str) {
		if (cookies.indexOf(str) < 0) cookies.unshift(str);
	});
	return cookies.join('; ');
}

function normalize(obj) {
	if (!obj.ext) {
		if (obj.mime) {
			obj.ext = mime.getExtension(obj.mime);
			if (!obj.ext) {
				// eslint-disable-next-line no-console
				console.warn("No extension found for mime type", obj.mime, obj.url);
			}
		}
		if (!obj.ext) {
			// eslint-disable-next-line no-console
			console.warn("Using extname", obj.pathname);
			obj.ext = Path.extname(obj.pathname).substring(1);
		}
	}
	delete obj.pathname;
	if (obj.ext) {
		obj.ext = obj.ext.toLowerCase();
		switch (obj.ext) {
		case "jpeg":
			obj.ext = "jpg";
			break;
		case "mpga":
			obj.ext = "mp3";
			break;
		}
	}

	var duree = obj.duration;
	if (obj.bitrate && !duree && obj.size) {
		var rate = parseInt(obj.bitrate) * 1000 / 8;
		duree = Duration.fromObject({
			seconds: parseInt(obj.size / rate)
		});
	} else if (duree) {
		duree = Duration.fromISO(duree);
		if (!duree.isValid && parseInt(obj.duration).toString() == obj.duration) {
			duree = Duration.fromObject({
				seconds: parseInt(obj.duration)
			});
		}
	}
	delete obj.bitrate;
	if (duree && duree.isValid) {
		obj.duration = duree.toFormat('hh:mm:ss');
	} else {
		delete obj.duration;
	}

	if (obj.title) obj.title = decodeHTML(obj.title);

	if (obj.description) {
		if (obj.title) obj.description = obj.description.replace(obj.title, "").trim();
		obj.description = decodeHTML(obj.description.split('\n')[0].trim());
	}

	if (obj.type == "embed") delete obj.size;

	if (obj.site) obj.site = normString(obj.site);
	if (obj.author) obj.author = normString(obj.author);

	var alt = encodeURI(obj.title);

	if (!obj.source && obj.ext == "html") {
		if (obj.type == "image") {
			if (obj.image) obj.source = obj.image;
			else if (!obj.html) obj.type = 'link';
		} else if (obj.type == "audio") {
			if (obj.audio) obj.source = obj.audio;
			else if (obj.embed) obj.source = obj.embed;
			else if (!obj.html) obj.type = 'link';
		} else if (obj.type == "video") {
			if (obj.video) obj.source = obj.video;
			else if (obj.embed) obj.source = obj.embed;
			else if (!obj.html) obj.type = 'link';
		} else if (obj.embed) {
			obj.source = obj.embed;
			obj.type = 'embed';
		}
	}

	if (obj.image) {
		if (!obj.thumbnail && obj.type != 'image') obj.thumbnail = obj.image;
		delete obj.image;
	}
	if (obj.audio) delete obj.audio;
	if (obj.video) delete obj.video;
	if (obj.embed) delete obj.embed;
	if (obj.oembed) delete obj.oembed;
	if (!obj.html) {
		var src = obj.source || obj.url;
		if (obj.type == "embed" || (obj.ext == "html" && ["audio", "video"].includes(obj.type))) {
			obj.html = `<iframe src="${src}"></iframe>`;
		} else if (obj.type == "image") {
			obj.html = `<img src="${src}" alt="${alt}" />`;
		} else if (obj.type == "video") {
			obj.html = `<video src="${src}"></video>`;
		} else if (obj.type == "audio") {
			obj.html = `<audio src="${src}"></audio>`;
		} else if (obj.type == "link") {
			obj.html = `<a href="${src}">${obj.title}</a>`;
		} else if (obj.type == "file" || obj.type == "archive") {
			obj.html = `<a href="${src}" target="_blank">${obj.title}</a>`;
		}
	}
	if (obj.date) obj.date = normDate(obj.date);
	if (!obj.date) delete obj.date;

	obj.width = normNum(obj.width);
	obj.height = normNum(obj.height);

	// remove all empty keys
	Object.keys(obj).forEach(function(key) {
		var val = obj[key];
		if (val == "" || val == null || (typeof val == 'number' && Number.isNaN(val))) delete obj[key];
	});

	return obj;
}

function normDate(str) {
	let dt = new Date(str);
	if (Number.isNaN(dt.getTime())) {
		// try to find a date
		const match = /\d{4}-\d{1,2}-\d{1,2}/.exec(str);
		if (match) {
			dt = new Date(match[0]);
			if (Number.isNaN(dt.getTime())) return;
		} else {
			return;
		}
	}
	return dt.toISOString().split('T')[0];
}

function normNum(str) {
	const n = parseFloat(str);
	return Number.isNaN(n) ? undefined : n;
}

function normString(str) {
	return decodeHTML(str.replace(/^@/, '').replace(/_/g, ' '));
}

function mime2type(obj) {
	var type = 'file';
	if (obj.subtype == "html") {
		type = 'link';
	} else if (obj.subtype == 'svg') {
		type = 'svg';
	} else if (['image', 'audio', 'video'].indexOf(obj.type) >= 0) {
		type = obj.type;
	} else if (['x-xz', 'x-gtar', 'x-gtar-compressed', 'x-tar', 'gzip', 'zip'].indexOf(obj.subtype) >= 0) {
		type = 'archive';
	}
	return type;
}

function pipeLimit(req, res, length, percent) {
	if (!length) return req.abort();
	if (percent) {
		var contentLength = parseInt(res.headers['content-length']);
		if (!Number.isNaN(contentLength)) {
			length = Math.max(length, contentLength * percent);
		}
	}
	var curLength = 0;
	res.on('data', function(buf) {
		if (res.nolimit) return;
		curLength += buf.length;
		if (curLength >= length) {
			debug("got %d bytes, aborting", curLength);
			req.abort();
		}
	});
}

function importTags(tags, obj, map, priorities = {}, priority = 0) {
	var val, tag, itag, key;
	for (tag in tags) {
		val = tags[tag];
		if (!val) continue;
		itag = tag.toLowerCase();
		key = map ? map[itag] : itag;
		if (key === undefined) continue;
		if (!Array.isArray(val)) val = [val];
		const list = [];
		val.map(val => {
			if (typeof key == "string") {
				list.push(val);
			} else {
				importTags(val, obj, key, priorities, priority);
			}
		});
		delete tags[tag];
		if (list.length) {
			if (!priorities[key] || priorities[key] < priority) {
				priorities[key] = priority;
				obj[key] = list.join(', ');
			}
		}
	}
}

function inspectHTML(obj, res, cb) {
	// collect tags
	var selectors = {
		title: {
			text: "title"
		},
		script: {
			type: {
				"application/ld+json": "jsonld"
			}
		},
		link: {
			rel: {
				icon: "icon",
				'shortcut icon': "icon",
				canonical: "canonical"
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
				'og:video:url': "video",
				'og:audio:url': "audio",
				'og:image:url': "image",
				'article:published_time': "date"
			},
			name: {
				'twitter:title': "title",
				'twitter:description': "description",
				'twitter:image': "thumbnail",
				'twitter:url': "url",
				'twitter:site': "site",
				'twitter:type': "type",
				'twitter:creator': "author",
				'author': "author"
			},
			itemprop: {
				name: "title",
				description: "description",
				duration: "duration",
				image: "image", // give priority to thumbnailurl when defined on same node
				thumbnailurl: "thumbnail",
				embedurl: "embed",
				width: "width",
				height: "height",
				datepublished: "date"
			}
		}
	};

	var parser = new SAXParser();
	var tags = {};
	var priorities = {};
	var curText, curKey, curPriority;
	var curSchemaType, curSchemaLevel;
	var firstSchemaType;
	var curLevel = 0;

	parser.on('startTag', function({tagName, attrs, selfClosing}) {
		var name = tagName.toLowerCase();
		if (name == "head") res.nolimit = true;
		if (name == "meta" || name == "link") selfClosing = true;
		if (!selfClosing) curLevel++;
		var key, nkey, atts, val, curatt;
		var selector = selectors[name];
		if (selector && selector.text) {
			key = selector.text;
		} else {
			atts = hashAttributes(attrs);
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
	parser.on('text', function({text}) {
		if (curText != null) curText += text;
	});
	parser.on('endTag', function({tagName}) {
		if (tagName == "head") delete res.nolimit;
		if (curSchemaLevel == curLevel) {
			// we finished parsing the content of an embedded Object, abort parsing
			curSchemaLevel = null;
			curSchemaType = null;
			return finish();
		}
		curLevel--;
		if (curText && curKey == "jsonld") {
			importJsonLD(tags, curText, priorities);
		} else if (curText && (!priorities[curKey] || curPriority > priorities[curKey])) {
			debug("Tag", tagName, "has key", curKey, "with text content", curText);
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
		var type = mapType(tags.type);
		if (type) obj.type = type;
		delete tags.type;
		Object.assign(obj, tags);
		cb();
	}

	res.pipe(parser);
}

function mapType(type) {
	if (!type) return type;
	if (/(^|\/|:)(video|movie)/i.test(type)) type = 'video';
	else if (/(^|\/|:)(audio|music)/i.test(type)) type = 'audio';
	else if (/(^|\/|:)(image|photo)/i.test(type)) type = 'image';
	else if (/(^|\/|:)(newsarticle)/i.test(type)) type = 'link';
	else type = null;
	return type;
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
			provider_name: 'site',
			author_name: 'author',
			description: 'description',
			duration: 'duration',
			date: 'upload_date'
		});
		if (obj.type == "photo") obj.type = "image";
		else if (obj.type == "rich" || !obj.type) obj.type = "embed";
		cb(null, tags);
	}));
}

function inspectSVG(obj, res, cb) {
	var parser = new SAXParser();
	parser.on('startTag', function({tagName, attrs}) {
		if (tagName.toLowerCase() != "svg") return;
		obj.type = "image";
		var box = attrs.find(function(att) {
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
	streat.run(res, {
		step: res.local ? Infinity : 0
	}, function(err, tags) {
		if (err) return cb(err);
		importTags(tags, obj, {
			imagewidth: 'width',
			imageheight: 'height',
			duration: 'duration',
			format: 'mime',
			mimetype: 'mime',
			filetypeextension: 'ext',
			extension: 'ext',
			title: 'title',
			artist: 'artist',
			album: 'album',
			objectname: 'title',
			audiobitrate: 'bitrate',
			creator: 'author',
			credit: 'author',
			imagedescription: 'description',
			description: 'description',
			modifydate: 'date',
			datetimecreated: 'date',
			datetimeoriginal: 'date',
			referenceurl: 'reference',
			'caption-abstract': 'description'
		});

		if (!obj.thumbnail && tags.Picture && tags.PictureMIMEType) {
			obj.thumbnail = dataUri.encode(
				Buffer.from(tags.Picture.replace(/^base64:/, ''), 'base64'),
				tags.PictureMIMEType
			);
		}
		if (obj.title && obj.artist && (obj.title + '').indexOf(obj.artist) < 0) {
			obj.title = obj.title + ' - ' + obj.artist;
			delete obj.artist;
		}
		if (obj.date) {
			const exifDate = parseExifDate(obj.date);
			if (exifDate) obj.date = exifDate;
			else delete obj.date;
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

function importJsonLD(tags, text, priorities) {
	try {
		var obj = JSON.parse(text);
		if (!Array.isArray(obj)) obj = [obj];
		var ld = {};
		obj.forEach((item) => {
			if (!item) return;
			var type = mapType(item["@type"]);
			if (type) {
				ld = item;
				tags.type = type;
				delete ld["@type"];
			}
		});
		importTags(ld, tags, {
			name: "title",
			description: "description",
			embedurl: "source",
			thumbnailurl: "thumbnail",
			datepublished: "date",
			author: { name: "author" },
			duration: "duration"
		}, priorities, 4);
	} catch (ex) {
		console.error("Cannot parse json-ld, ignoring", ex, text);
	}
}

function parseExifDate(str) {
	let [date, time] = str.split(" ");
	if (date) str = date.replace(/:/g, '-') + 'T' + time;

	const dt = DateTime.fromISO(str, {
		zone: 'utc'
	});
	if (!dt.isValid) return;
	return dt.toISO({
		suppressMilliseconds: true,
		suppressSeconds: true
	});
}
