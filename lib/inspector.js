var http = require('http');
var https = require('https');
var URL = require('url');
var Path = require('path');
var BufferList = require('bl');
var moment = require('moment');
var MediaTyper = require('media-typer');
var Dom = require('whacko');
var Exif = require('exiftool');
var debug = require('debug')('url-inspector');
var quvi = require('./quvi');

var Pool2 = require('pool2');

var pool = new Pool2({
	acquire: function(cb) {
		cb(null, {});
	},
	dispose: function(client, cb) {
		cb();
	},
	max : 4,
	min : 1,
	idleTimeout: 10000,
	syncInterval: 10000
});

module.exports = function(url, opts, cb) {
	if (!cb && typeof opts == "function") {
		cb = opts;
		opts = null;
	}
	opts = Object.assign({}, { all: false }, opts);
	pool.acquire(function(err, inst) {
		if (err) return cb(err);
		inspector(url, opts, function(err, info) {
			pool.release(inst);
			cb(err, info);
		});
	});
};

var inspectors = {
	image: [inspectMedia, 30000],
	audio: [inspectMedia, 30000],
	video: [inspectMedia, 100000],
	html: [inspectHTML, 2000],
	json: [inspectJSON, 100],
	xml: [inspectXML, 100],
	archive: [inspectData, false],
	data: [inspectData, false]
};

function inspector(url, opts, cb) {
	url = encodeURI(url);
	var urlObj = URL.parse(url);
	urlObj.headers = {
		"User-Agent": "Mozilla/5.0"
	};
	debug("test url", url);
	quvi.supports(urlObj.hostname, function(err, yes) {
		if (err) console.error(err);
		if (!yes) {
			return request(urlObj, opts, cb);
		}
		quvi.query(url, function(err, tags) {
			if (err) return cb(err);
			debug("quvi tags", tags);
			var obj = {
				type: 'video',
				mime: 'text/html',
				ext: 'html'
			};
			importTags(tags, obj, {
				page_title: 'name',
				thumbnail_url: 'thumbnail',
				duration: 'duration'
			});
			if (obj.duration) obj.duration = secondsToDuration(obj.duration);
			if (opts.all) obj.all = tags;
			cb(null, obj);
		});
	});
}

function request(urlObj, opts, cb) {
	debug("request url", urlObj.href);
	var req = (/^https:?$/.test(urlObj.protocol) ? https : http).request(urlObj, function(res) {
		var status = res.statusCode;
		debug("got response status %d", status);
		if (status < 200 || status >= 400) return cb(status);
		if (status >= 300 && status < 400 && res.headers.location) {
			var redirObj = URL.parse(res.headers.location);
			redirObj.redirects = (urlObj.redirects || 0) + 1;
			if (redirObj.redirects >= 5) return cb("Too many http redirects");
			return request(redirObj, opts, cb);
		}
		var mimeObj = MediaTyper.parse(res.headers['content-type']);
		var obj = {
			mime: MediaTyper.format(mimeObj),
			type: mime2type(mimeObj),
			size: res.headers['content-length']
		};
		debug("got response (mime, type, length) is (%s, %s, %d)", obj.mime, obj.type, obj.size);
		var fun = inspectors[obj.type];
		(function(next) {
			if (fun[1]) bufferBegin(req, res, fun[1], next);
			else next();
		})(function(err, buf) {
			if (err) console.error(err);
			fun[0](obj, buf, function(err, tags) {
				if (err) console.error(err);
				var basename = Path.basename(urlObj.pathname);
				var fileext = Path.extname(basename);
				if (!obj.ext) {
					obj.ext = fileext.substring(1);
				}
				obj.ext = obj.ext.toLowerCase();
				if (!obj.name) {
					obj.name = Path.basename(basename, fileext);
				}
				if (opts.all) obj.all = tags;
				cb(null, obj);
			});
		});
	}).on('error', function(err) {
		return cb(err);
	});
	req.end();
}

function mime2type(obj) {
	var type = 'data';
	if (['image', 'audio', 'video'].indexOf(obj.type) >= 0) {
		type = obj.type;
	} else if (['html', 'css', 'json', 'xml', 'plain'].indexOf(obj.subtype) >= 0) {
		type = obj.subtype;
	} else if (obj.subtype == 'svg') {
		type = 'image';
	} else if (['x-xz', 'x-gtar', 'x-gtar-compressed', 'x-tar', 'gzip', 'zip'].indexOf(obj.subtype) >= 0) {
		type = 'archive';
	}
	return type;
}

function bufferBegin(req, res, length, cb) {
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
	for (tag in map) {
		val = tags[tag];
		if (val === undefined) continue;
		delete tags[tag];
		key = map[tag];
		prev = obj[key];
		if (prev != null && val != prev) {
			console.warn(key, "was", prev, "overriden by", val);
		}
		obj[key] = val;
	}
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
			title: 'name',
			album: 'album'
		});
		if (tags.audioBitrate && !tags.duration) {
			var rate = parseInt(tags.audioBitrate) * 1000 / 8;
			obj.duration = secondsToDuration(obj.size / rate);
		}
		// copy to be able to serialize to JSON
		cb(null, Object.assign({}, tags));
	});
}

function secondsToDuration(num) {
	var duration = moment.duration(parseInt(num), 'seconds');
	return moment(duration._data).format('HH:mm:ss');
}

function inspectHTML(obj, buf, cb) {
	var dom = Dom.load(buf);
	var title = dom('title, h1');
	obj.name = title.first().text();
	cb();
}

function inspectJSON(obj, buf, cb) {
	obj.sample = buf.toString().replace(/\s*/g, '').substring(0, 30);
	cb();
}

function inspectXML(obj, buf, cb) {
	obj.sample = buf.toString().replace(/\s*/g, '').substring(0, 30);
	cb();
}

function inspectData(obj, buf, cb) {
	cb();
}

