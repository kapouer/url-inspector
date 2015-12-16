var WebKit = require('webkitgtk');
var URL = require('url');
var Path = require('path');
var Pool2 = require('pool2');

var defaults = {
	width: 120,
	height: 90,
	quality: 0.85,
	type: 'image/jpeg'
};

// youtube, image centrée, vidéo pure - et rien pour le reste

module.exports = function(opts) {
	if (!opts) opts = {};
	for (var k in defaults) if (opts[k] == undefined) opts[k] = defaults[k];
	var pool = new Pool2({
		acquire: function(cb) {
			var view = new WebKit();
			view.init({
				display: opts.display,
				width: opts.width,
				height: opts.height,
				verbose: true,
				cookiePolicy: "never"
			}, cb);
		},
		dispose: function(client, cb) {
			client.unload(cb);
		},
		destroy: function(client) {
			client.destroy();
		},
		max : 2,
		min : 1,
		idleTimeout: 10000,
		syncInterval: 10000
	});
	return function(url, cb) {
		pool.acquire(function(err, view) {
			if (err) return cb(err);
			inspector(view, opts, url, function(err, info) {
				view.removeAllListeners('response');
				view.removeAllListeners('load');
				pool.release(view);
				cb(err, info);
			});
		});
	};
};



function inspector(view, opts, url, cb) {
	var info = {};
	var orl = URL.parse(url);
	info.name = Path.basename(orl.pathname);
	var interrupt = false;

	if (alternate(url, info, cb)) return;

	view.load(url, {
		// let only first request go through yet allow redirections
		filter: function() {
			if (this.uri != document.location.href) {
				this.cancel = true;
			}
		},
		width: opts.width,
		height: opts.height,
		cookiepolicy: "never"
	}, function(err) {
		// we're not going to get a response
		if (interrupt) return;
		if (err && isNaN(parseInt(err))) return cb(err);
	}).once('response', function(res) {
		// look only first response
		if (interrupt) return;
		if (res.status < 200 || res.status >= 400) return cb(res.status);
	}).once('data', function(res) {
		info.size = res.length;
		if (res.filename) info.name = Path.basename(res.filename);
		info.mime = res.mime || "application/octet-stream";
		info.type = mime2type(info.mime);
		if (['image', 'html'].indexOf(info.type) >= 0) {
			this.once('ready', function() {
				// wait until document is loaded
				explore(view, info, opts, function(err) {
					if (err) console.error(err);
					cb(null, info);
				});
			});
		} else {
			interrupt = true;
			this.unload(function(err) {
				cb(null, info);
			});
		}
	});
}

function alternate(url, info, cb) {
	if (youtube(url, info, cb)) return true;
}

function explore(view, info, opts, cb) {
	if (info.type == "image") {
		view.run(function(opts, done) {
			var canvas = document.createElement("canvas");
			var ctx = canvas.getContext("2d");
			var origImg = document.querySelector('img');
			var img = new Image();
			img.onload = function() {
				function resize(img, width, height) {
					// img just need to be something with width, height properties
					var ratio = img.width / width > img.height / height
						? img.width / width
						: img.height / height;

					if (ratio > 1) {
						width = Math.ceil(img.width / ratio);
						height = Math.ceil(img.height / ratio);
					} else {
						width = img.width;
						height = img.height;
					}
					return {width: width, height: height};
				}
				var target = resize(img, opts.width, opts.height);
				canvas.width = target.width;
				canvas.height = target.height;

				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				done(null, img.width, img.height, canvas.toDataURL(opts.type, opts.quality));
			};
			img.src = origImg.src;
		}, opts, function(err, width, height, dataURI) {
			if (err) console.error(err);
			info.width = width;
			info.height = height;
			info.thumbnail = dataURI;
			cb();
		});
	} else if (info.type == "html") {
		view.run(function() {
			return document.title;
		}, function(err, title) {
			info.name = title;
			cb();
		});
	} else {
		cb();
	}
}

function mime2type(mime) {
	var type = 'data';
	if (mime.startsWith('image')) type = 'image';
	else if (mime.startsWith('audio')) type = 'audio';
	else if (mime.startsWith('video')) type = 'video';
	else if (mime == "text/html") type = 'html';
	else if (mime == "text/css") type = 'css';
	else if (mime == "text/plain") type = 'text';
	else if (mime == "application/json") type = 'json';
	else if (mime == "application/xml") type = 'xml';
	return type;
}

function youtube(url, info, cb) {
	// https://www.youtube.com/embed/CtP8VABF5pk
	// https://www.youtube.com/watch?v=CtP8VABF5pk
	// https://youtu.be/CtP8VABF5pk
	var obj = URL.parse(url, true);
	if (/youtu\.?be\./.test(obj.hostname) == false) return;
	var vid;
	var regm = /(?:^\/embed\/([a-zA-Z0-9]+))/.exec(obj.pathname);
	if (regm && regm.length == 2) vid = regm[1];
	if (!vid && obj.path == "/watch") vid = obj.query.v;
	if (!vid && /^\/[a-zA-Z0-9]+$/.test(obj.pathname)) vid = obj.pathname.substring(1);
	if (!vid) return;
	info.thumbnail = "http://img.youtube.com/vi/" + vid + "/default.jpg";
	info.type = 'video';
	info.mime = 'text/html';
	cb(null, info);
//	request({
//		url: "https://www.googleapis.com/youtube/v3/videos?part=snippet%2CcontentDetails&id=" + vid,
//		type: 'json'
//	}, function(err, req, obj) {
//		if (err) return cb(err);
//		console.log(err, obj);
//		if (!obj.items.length == 1) return cb(404);
//		info.name = obj.items[0].snippet.title;
//		info.duration = obj.items[0].contentDetails.duration;
//		cb(null, info);
//	});
	return true;
}
