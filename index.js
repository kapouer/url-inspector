var http = require('http');
var https = require('https');
var URL = require('url');
var BufferList = require('bl');
var moment = require('moment');
var MediaTyper = require('media-typer');
var Dom = require('whacko');
var Exif = require('exiftool');
var debug = require('debug')('url-inspector');
//var Quvi = require('quvi');

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
	image: inspectMedia,
	audio: inspectMedia,
	video: inspectMedia,
	html: inspectHTML,
	json: inspectJSON,
	xml: inspectXML,
	archive: inspectArchive,
	data: inspectData
};

function inspector(url, opts, cb) {
	// 1) fetch http headers
	var urlObj = URL.parse(encodeURI(url));
	urlObj.headers = {
		Accept: '*/*',
		"User-Agent": "Mozilla/5.0"
	};
	debug("fetch url", url);
	var req = (urlObj.protocol == 'https' ? https : http).request(urlObj, function(res) {
		if (res.statusCode < 200 || res.statusCode >= 400) return cb(res.statusCode);
		debug("got response %d with headers", res.statusCode, res.headers);
		var mimeObj = MediaTyper.parse(res.headers['content-type']);
		var obj = {
			mime: MediaTyper.format(mimeObj),
			type: mime2type(mimeObj),
			size: res.headers['content-length']
		};
		debug("got response (mime, type, length) is (%s, %s, %d)", obj.mime, obj.type, obj.size);
		inspectors[obj.type](obj, req, res, opts, cb);
	}).on('error', cb);
	req.end();
	// 2) if it's image/video/audio, load more data and use exiftool
	// 3) else if it's html, try quvi else inspect content
	// 4) else if it's json/xml, return first lines of prettyfied content
	// 5) else if it's something compressed, return file list ?
	// 6) else if it's doc/xls/ppt/pdf/ps, return basic info
	// 7) else unknown stuff return Content-Length

}

function mime2type(obj) {
	var type = 'data';
	if (['image', 'audio', 'video'].indexOf(obj.type) >= 0) {
		type = obj.type;
	} else if (['html', 'css', 'json', 'xml', 'plain'].indexOf(obj.subtype) >= 0) {
		type = obj.subtype;
	} else if (obj.subtype == 'svg') {
		type = 'image';
	} else if (['x-gtar', 'x-gtar-compressed', 'x-tar', 'gzip', 'zip'].indexOf(obj.subtype) >= 0) {
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
		if (val == null) continue;
		key = map[tag];
		prev = obj[key];
		if (prev != null && val != prev) {
			console.warn(key, "was", prev, "overriden by", val);
		}
		obj[key] = val;
	}
}

function inspectMedia(obj, req, res, opts, cb) {
	// load more data
	bufferBegin(req, res, 2000, function(err, buf) {
		if (err) return cb(err);
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
				extension: 'extension',
				title: 'name',
				album: 'album'
			});
			if (tags.audioBitrate && !tags.duration) {
				var rate = parseInt(tags.audioBitrate) * 1000 / 8;
				var duration = moment.duration(obj.size / rate, 'seconds');
				obj.duration = moment(duration._data).format('HH:mm:ss');
			}
			cb(null, obj);
		});
	});
}

function inspectHTML(obj, req, res, opts, cb) {
	bufferBegin(req, res, 2000, function(err, buf) {
		if (err) return cb(err);
		var dom = Dom.load(buf);
		var title = dom('title, h1');
		obj.name = title.first().text();
		cb(null, obj);
	});
}

function inspectJSON(obj, req, res, opts, cb) {

}

function inspectXML(obj, req, res, opts, cb) {

}

function inspectArchive(obj, req, res, opts, cb) {

}

function inspectData(obj, req, res, opts, cb) {

}

