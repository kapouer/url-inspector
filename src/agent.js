const http = require('http');
const httpAgent = new http.Agent({});
const https = require('https');
const httpsAgent = new https.Agent({
	rejectUnauthorized: false
});
const Path = require('path');
const ContentDisposition = require('content-disposition');
const MediaTyper = require('media-typer');
const iconv = require('iconv-lite');
const Cookie = require('tough-cookie').Cookie;
const mime = require('mime');
const fs = require('fs');
const URL = require('url');
const debug = require('debug')('url-inspector');

const inspectSax = require('./sax');
const inspectEmbed = require('./embed');
const inspectStreat = require('./streat');

// maximum bytes to download for each type of data
const inspectors = {
	embed: [inspectEmbed.embed, 10000],
	svg: [inspectSax.svg, 30000],
	image: [inspectStreat.media, 30000, 0.1],
	audio: [inspectStreat.media, 200000, 0.1],
	video: [inspectStreat.media, 100000, 0.1],
	link: [inspectSax.html, 150000],
	file: [inspectStreat.file, 32000],
	archive: [(obj, res, cb) => {
		cb(null, obj);
	}, 0]
};

exports.exists = function (urlObj, cb) {
	const opts = Object.assign({}, urlObj);
	opts.method = 'HEAD';
	const secure = /^https:?$/.test(urlObj.protocol);
	if (opts.pathname && !opts.path) opts.path = opts.pathname;
	const req = (secure ? https : http).request(opts, (res) => {
		const status = res.statusCode;
		debug("remote", URL.format(urlObj), "returns", status);
		req.abort();
		if (status == 204 || res.headers['Content-Length'] == 0) return cb(false);
		else if (status >= 200 && status < 400) return cb(true);
		else return cb(false);
	});
	req.end();
};

exports.request = function (urlObj, obj, cb) {
	if (!urlObj.href) urlObj.href = URL.format(urlObj);
	debug("request url", urlObj.href);

	doRequest(urlObj, (err, req, res) => {
		if (err) return cb(err);
		const status = res.statusCode;
		res.pause();
		debug("got response status %d", status);

		if (status < 200 || (status >= 400 && status < 600)) {
			// definitely an error - status above 600 could be an anti-bot system
			return cb(status);
		}
		if (status >= 300 && status < 400 && res.headers.location) {
			req.abort();
			const location = URL.resolve(urlObj.href, res.headers.location);
			debug("to location", location);
			const redirObj = URL.parse(location);
			redirObj.headers = Object.assign({}, urlObj.headers);
			const cookies = replyCookies(res.headers['set-cookie'], redirObj.headers.Cookie);
			if (cookies) {
				debug("replying with cookie", cookies);
				redirObj.headers.Cookie = cookies;
			}
			redirObj.redirects = (urlObj.redirects || 0) + 1;
			if (redirObj.redirects >= 5) return cb("Too many http redirects");
			return exports.request(redirObj, obj, cb);
		}

		let contentType = res.headers['content-type'];

		if (!contentType) contentType = mime.getType(Path.basename(urlObj.pathname));
		const mimeObj = MediaTyper.parse(contentType);
		if (obj.type == "embed") {
			obj.mime = "text/html";
		} else {
			obj.mime = MediaTyper.format(mimeObj);
			if (obj.mime) obj.mime = obj.mime.toLowerCase();
			obj.type = mime2type(mimeObj);
		}
		obj.ext = mime.getExtension(obj.mime);

		const contentLength = res.headers['content-length'];
		if (contentLength != null) {
			obj.size = parseInt(contentLength);
		}
		let disposition = res.headers['content-disposition'];
		if (disposition != null) {
			debug("got content disposition", disposition);
			if (disposition.startsWith('filename=')) disposition = 'attachment; ' + disposition;
			try {
				disposition = ContentDisposition.parse(disposition);
			} catch (ex) {
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
		let charset = mimeObj.parameters && mimeObj.parameters.charset;
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
		const fun = inspectors[obj.type];
		if (urlObj.protocol != "file:") pipeLimit(req, res, fun[1], fun[2]);
		fun[0](obj, res, (err, tags) => {
			if (err) {
				// eslint-disable-next-line no-console
				console.error(err);
			}
			req.abort();
			// request oembed when
			// - not blacklisted (noembed)
			// - has already or has found a oembed url
			// - does not have a thumbnail or does not have an html embed code,
			const fetchEmbed = !obj.noembed && obj.oembed && (!obj.thumbnail || !obj.html);
			delete obj.noembed;
			let canon = obj.canonical;
			if (canon && urlObj.protocol != "file:" && canon != obj.source && obj.nocanonical !== true) {
				canon = URL.parse(canon);
				canon.redirects = (urlObj.redirects || 0) + 1;
			}
			delete obj.canonical;
			delete obj.nocanonical;
			if (fetchEmbed) {
				obj.type = "embed";
				// prevent loops
				obj.noembed = true;
				debug("fetch embed", obj.oembed);
				const urlObjEmbed = URL.parse(obj.oembed);
				urlObjEmbed.headers = Object.assign({}, urlObj.headers);
				if (urlObj.protocol) urlObjEmbed.protocol = urlObj.protocol;
				exports.request(urlObjEmbed, obj, cb);
			} else if (canon && canon.redirects < 5 && canon.pathname != urlObj.pathname && canon.pathname + '/' != urlObj.pathname && canon.pathname != urlObj.pathname + '/') {
				debug("fetch canonical url", canon.href);
				canon.headers = Object.assign({}, urlObj.headers);
				exports.request(canon, obj, (err, cobj, ctags) => {
					if (err) return cb(null, obj, tags);
					else return cb(null, cobj, ctags);
				});
			} else {
				cb(null, obj, tags);
			}
		});
	});
};

function doRequest(urlObj, cb) {
	let req;
	if (urlObj.protocol == "file:") {
		fs.stat(urlObj.pathname, (err, stat) => {
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
		const opts = Object.assign({}, urlObj);
		const secure = /^https:?$/.test(urlObj.protocol);
		opts.agent = secure ? httpsAgent : httpAgent;
		if (opts.pathname && !opts.path) opts.path = opts.pathname;

		try {
			req = (secure ? https : http).request(opts, (res) => {
				cb(null, req, res);
			}).on('error', (err) => {
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

function mime2type(obj) {
	let type = 'file';
	if (obj.subtype == "html") {
		type = 'link';
	} else if (obj.subtype == 'svg') {
		type = 'svg';
	} else if (['image', 'audio', 'video'].indexOf(obj.type) >= 0) {
		type = obj.type;
	} else if (['x-xz', 'x-gtar', 'x-gtar-compressed', 'x-tar', 'gzip', 'zip'].indexOf(obj.subtype) >= 0) {
		type = 'archive';
	} else if (obj.subtype == "json") {
		type = 'embed';
	}
	return type;
}

function pipeLimit(req, res, length, percent) {
	if (!length) return req.abort();
	if (percent) {
		const contentLength = parseInt(res.headers['content-length']);
		if (!Number.isNaN(contentLength)) {
			length = Math.max(length, contentLength * percent);
		}
	}
	let curLength = 0;
	res.on('data', (buf) => {
		if (res.nolimit) return;
		curLength += buf.length;
		if (curLength >= length) {
			debug("got %d bytes, aborting", curLength);
			req.abort();
		}
	});
}

function replyCookies(setCookies, prev) {
	if (!setCookies) return prev;
	let cookies;
	if (Array.isArray(setCookies)) cookies = setCookies.map(Cookie.parse);
	else cookies = [Cookie.parse(setCookies)];
	cookies = cookies.map((cookie) => {
		return cookie.cookieString();
	});
	if (prev) prev.split('; ').forEach((str) => {
		if (cookies.indexOf(str) < 0) cookies.unshift(str);
	});
	return cookies.join('; ');
}

function lexize(str) {
	const list = [];
	const parts = str.split('.');
	if (parts.length > 1) {
		const ext = parts.pop();
		if (ext.length <= 4) str = parts.join(' ');
	}

	str.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').split(' ').forEach((word) => {
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
		const newstr = list.join(' ');
		if (newstr.length <= 1) return str;
		return newstr;
	} else {
		return str;
	}
}
