var http = require('http');
var https = require('https');
var URL = require('url');
var Path = require('path');
var ContentDisposition = require('content-disposition');
var BufferList = require('bl');
var moment = require('moment');
var MediaTyper = require('media-typer');
var mime = require('mime');
var Dom = require('whacko');
var Exif = require('exiftool');
var debug = require('debug')('url-inspector');
var OEmbedProviders = require('oembed-providers-unofficial');

module.exports = inspector;

var inspectors = {
	embed: [inspectEmbed, Infinity],
	svg: [inspectSVG, 30000],
	image: [inspectMedia, 30000],
	audio: [inspectMedia, 30000],
	video: [inspectMedia, 100000],
	link: [inspectHTML, 150000],
	file: [inspectFile, 100],
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
	urlObj.headers = {
		"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/47.0.2526.111 Safari/537.36"
	};
	debug("test url", obj.url);

	var oEmbedUrl = opts.noembed ? {} : supportsOEmbed(urlObj);
	if (oEmbedUrl.url) {
		debug("oembed candidate");
		oEmbedUrl.obj = URL.parse(oEmbedUrl.url);
		obj.type = "embed";
		obj.mime = "text/html";
	}
	if (opts.noembed) obj.noembed = true;
	request(oEmbedUrl.obj || urlObj, obj, function(err, tags) {
		if (err) {
			if (oEmbedUrl.discovery) {
				console.warn(`Discoverable oembed endpoint ${oEmbedUrl.url} error, ignore oembed`);
				return inspector(url, Object.assign({noembed: true}, opts), cb);
			}
			return cb(err);
		}
		if (!obj) return cb(400);
		if (!obj.site) {
			obj.site = urlObj.hostname;
		}
		normalize(obj);
		if (opts.all && tags) obj.all = tags;
		if (obj.thumbnail) {
			obj.thumbnail = absolutize(urlObj, obj.thumbnail);
		}
		if (obj.icon) {
			obj.icon = absolutize(urlObj, obj.icon);
			cb(null, obj);
		} else {
			var iconObj = {
				host: urlObj.host,
				protocol: urlObj.protocol,
				pathname: '/favicon.ico'
			};
			remoteExists(iconObj, function(yes) {
				if (yes) obj.icon = URL.format(iconObj);
				cb(null, obj);
			});
		}
	});
}

function supportsOEmbed(urlObj, cb) {
	var ret = {};
	var endpoint;
	var url = urlObj.href;
	var provider = OEmbedProviders.find(function(provider) {
		endpoint = provider.endpoints.find(function(point) {
			if (!point.schemes) return false;
			return !!point.schemes.find(function(scheme) {
				return new RegExp("^" + scheme.replace("*", ".*") + "$").test(url);
			});
		});
		return !!endpoint;
	});
	if (!provider) {
		return ret;
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
	var req = (/^https:?$/.test(urlObj.protocol) ? https : http)
	.request(opts, function(res) {
		var status = res.statusCode;
		req.abort();
		if (status >= 200 && status < 400) return cb(true);
		else return cb(false);
	});
	req.end();
}

function request(urlObj, obj, cb) {
	debug("request url", urlObj.href);
	var req = (/^https:?$/.test(urlObj.protocol) ? https : http).request(urlObj, function(res) {
		var status = res.statusCode;
		debug("got response status %d", status);
		if (status < 200 || status >= 400 || status == 303) return cb(status);
		if (status >= 300 && status < 400 && res.headers.location) {
			var redirObj = URL.parse(res.headers.location);
			if (!redirObj.host) redirObj.host = urlObj.host;
			if (!redirObj.protocol) redirObj.protocol = urlObj.protocol;
			redirObj.redirects = (urlObj.redirects || 0) + 1;
			if (redirObj.redirects >= 5) return cb("Too many http redirects");
			return request(redirObj, obj, cb);
		}

		var contentType = res.headers['content-type'];
		if (!contentType) contentType = mime.lookup(Path.basename(urlObj.pathname));
		var mimeObj = MediaTyper.parse(contentType);
		if (obj.type == "embed") {
			obj.mime = "text/html";
			obj.type = "embed";
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
		if (obj.title == null) obj.title = Path.basename(urlObj.path);

		debug("(mime, type, length) is (%s, %s, %d)", obj.mime, obj.type, obj.size);
		var fun = inspectors[obj.type];
		(function(next) {
			if (fun[1]) buffer(req, res, fun[1], next);
			else next();
		})(function(err, buf) {
			if (err) console.error(err);
			fun[0](obj, buf, function(err, tags) {
				if (err) console.error(err);
				cb(null, obj, tags);
			});
		});
	}).on('error', function(err) {
		return cb(err);
	});
	req.end();
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

	if (obj.site.startsWith('@')) obj.site = obj.site.substring(1);
	obj.site = obj.site.toLowerCase();

	var alt = encodeURI(obj.title);

	if (!obj.html) {
		if (obj.embed) {
			obj.html = `<iframe src="${obj.embed}"></iframe>`;
		} else  if (obj.type == "image") {
			obj.html = `<img src="${obj.url}" alt="${alt}" />`;
		} else if (obj.type == "video") {
			obj.html = `<video src="${obj.url}"></video>`;
		} else if (obj.type == "audio") {
			obj.html = `<audio src="${obj.url}"></audio>`;
		} else if (obj.type == "embed") {
			obj.html = `<iframe src="${obj.url}"></iframe>`;
		} else if (obj.type == "link") {
			obj.html = `<a href="${obj.url}">${obj.title}</a>`;
		} else if (obj.type == "file" || obj.type == "archive") {
			obj.html = `<a href="${obj.url}" target="_blank">${obj.title}</a>`;
		}
	}
}

function absolutize(obj, url) {
	var urlObj = URL.parse(url);
	if (!urlObj.host) {
		urlObj.host = obj.host;
		urlObj.protocol = obj.protocol;
		url = URL.format(urlObj);
	}
	return url;
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

function buffer(req, res, length, cb) {
	var bl = new BufferList();
	res.on('data', function(buf) {
		bl.append(buf);
		if (bl.length >= length) {
			debug("got %d bytes, aborting", bl.length);
			req.abort();
		}
	});
	res.on('end', function(buf) {
		if (buf) bl.append(buf);
		debug("response ended, got %d bytes", bl.length);
		cb(null, bl.slice());
	});
	res.resume();

}

function importTags(tags, obj, map) {
	var val, tag, key, prev;
	if (!map) {
		// no map means all keys are already good
		map = {};
		for (key in tags) map[key] = key;
	}
	for (tag in map) {
		val = tags[tag];
		if (val === undefined) continue;
		delete tags[tag];
		key = map[tag];
		prev = obj[key];
		obj[key] = val;
	}
}

function importMeta(dom, map, obj) {
	var key, val, node, parent, sel;
	// search all tags within the same parent
	for (key in map) {
		sel = `meta[name="${map[key]}"],meta[property="${map[key]}"]`;
		if (!parent) {
			node = dom(sel).first();
			if (!node.length) continue;
			parent = node.parent();
		} else {
			node = parent.find(sel).first();
			if (!node.length) continue;
		}
		val = node.attr('content');
		if (val != null && val != "") obj[key] = val;
	}
}

function importSchema(sel, obj, map) {
	var key, val;
	for (key in map) {
		val = sel.children(`[itemprop="${key}"]`).first();
		if (val.length == 0) continue;
		if (val.is('link')) val = val.attr('href');
		else val = val.attr('content');
		if (val != null && val != "") obj[map[key]] = val;
	}
}

function importScope(scopes, obj, schemaType, type) {
	if (schemaType) scopes = scopes.filter(`[itemtype="http://schema.org/${schemaType}"]`);
	var scope = scopes.first();
	if (!scope.length) return false;
	debug('found scope', schemaType);
	var nobj = {};
	importSchema(scope, nobj, {
		name: 'title',
		duration: 'duration',
		thumbnailURL: 'thumbnail',
		thumbnailUrl: 'thumbnail',
		embedURL: 'embed',
		embedUrl: 'embed',
		width: 'width',
		height: 'height'
	});
	if (nobj.embed && type) {
		debug("scope changes type to", type);
		nobj.type = type;
	}
	Object.assign(obj, nobj);
	return true;
}

function formatDuration(mom) {
	return moment(mom._data).format('HH:mm:ss');
}

function inspectSVG(obj, buf, cb) {
	var dom = Dom.load(buf);
	var box = dom('svg').attr("viewBox");
	obj.type = "image";
	if (!box) return cb(null, obj);
	var parts = box.split(/\s+/);
	if (parts.length == 4) {
		obj.width = parseFloat(parts[2]);
		obj.height = parseFloat(parts[3]);
	}
	cb(null, obj);
}

function inspectMedia(obj, buf, cb) {
	Exif.metadata(buf, function(err, tags) {
		if (err) return cb(err);
		debug("exiftool got", tags);
		if (tags && tags.error) return cb(tags.error);
		if (!tags) return cb();
		importTags(tags, obj, {
			imageWidth: 'width',
			imageHeight: 'height',
			duration: 'duration',
			mimeType: 'mime',
			extension: 'ext',
			title: 'title',
			album: 'album',
			objectName: 'title'
		});
		if (tags.audioBitrate && !obj.duration) {
			var rate = parseInt(tags.audioBitrate) * 1000 / 8;
			obj.duration = moment.duration(parseInt(obj.size / rate), 'seconds');
		}
		// copy to be able to serialize to JSON
		cb(null, Object.assign({}, tags));
	});
}

function inspectHTML(obj, buf, cb) {
	var dom = Dom.load(buf);
	importTags({
		title: dom('title, h1').first().text(),
		icon: dom('link[rel="icon"],link[rel="shortcut icon"]').first().attr('href')
	}, obj);
	var oldType = obj.type;
	delete obj.type;
	importMeta(dom, {
		title: "og:title",
		thumbnail: "og:image",
		url: "og:url",
		type: "og:type",
		site: "og:site_name"
	}, obj);
	var ogType = obj.type;
	if (ogType) {
		if (ogType.startsWith('video')) obj.type = 'video';
		else if (ogType.startsWith('music')) obj.type = 'audio';
		else obj.type = 'link';
	} else {
		obj.type = oldType;
	}
	importMeta(dom, {
		title: "twitter:title",
		thumbnail: "twitter:image",
		url: "twitter:url",
		site: "twitter:site",
		type: "twitter:card"
	}, obj);
	if (obj.type == "photo") obj.type = "image";
	else obj.type = oldType;

	var scopes = dom('[itemscope]');
	if (scopes.length) {
		importScope(scopes, obj, 'VideoObject', 'video')
		|| importScope(scopes, obj, 'AudioObject', 'audio')
		|| importScope(scopes, obj, 'ImageObject', 'image')
		|| importScope(scopes, obj, 'WebPage')
		|| importScope(scopes, obj);
	} else {
		debug("no scopes found");
	}

	var oembed = obj.noembed ? false : dom('link[type="application/json+oembed"]').attr('href');
	delete obj.noembed;
	if (oembed && (!obj.thumbnail || !obj.embed)) {
		obj.type = "embed";
		request(URL.parse(oembed), obj, cb);
	} else {
		cb();
	}
}

function inspectEmbed(obj, buf, cb) {
	var tags = JSON.parse(buf.toString());
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
}

function inspectFile(obj, buf, cb) {
//	obj.sample = buf.toString().replace(/\s+/g, ' ').substring(0, 30);
	cb();
}

function inspectArchive(obj, buf, cb) {
	cb();
}

function inspectLink(obj, buf, cb) {
	cb();
}

