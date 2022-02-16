const Path = require('path');
const ContentDisposition = require('content-disposition');
const ContentType = require('content-type');
const MediaTyper = require('media-typer');
const iconv = require('iconv-lite');
const mime = require('mime');
const fs = require('fs');
const { PassThrough } = require('stream');
const debug = require('debug')('url-inspector');
const { curly, CurlCode } = require('node-libcurl');
const { getProxyForUrl } = require('proxy-from-env');

const inspectSax = require('./sax');
const inspectEmbed = require('./embed');
const inspectStreat = require('./streat');

// maximum bytes to download for each type of data
const inspectors = {
	embed: [inspectEmbed.embed, 30000],
	svg: [inspectSax.svg, 30000],
	image: [inspectStreat.media, 128000, 0.1],
	audio: [inspectStreat.media, 200000, 0.1],
	video: [inspectStreat.media, 512000, 0.1],
	link: [inspectSax.html, 512000],
	file: [inspectStreat.file, 32000],
	archive: [(obj, res, cb) => {
		cb(null, obj);
	}, 0]
};

exports.exists = function (urlObj, cb) {
	urlObj.method = 'HEAD';
	curlRequest(urlObj).then(req => {
		const res = req.res;
		const status = res.statusCode;
		debug("remote", urlObj, "returns", status);
		if (status == 204 || res.headers['content-length'] == 0) {
			return cb(false);
		} else if (status >= 200 && status < 400) {
			return cb(parseType(res.headers['content-type']));
		} else {
			return cb(false);
		}
	}).catch(err => {
		cb(false);
	});
};

exports.request = function (urlObj, obj, cb) {
	debug("request url", urlObj.href);
	doRequest(urlObj, (err, req, res) => {
		if (err) return cb(err);
		const { statusCode, headers } = res;
		debug("got response status %d", statusCode);

		if (statusCode < 200 || (statusCode >= 400 && statusCode < 600)) {
			// definitely an error - status above 600 could be an anti-bot system
			return cb(statusCode);
		}
		if (headers.location) obj.location = new URL(headers.location, urlObj);
		let contentType = headers['content-type'];
		if (!contentType) contentType = mime.getType(Path.basename(urlObj.pathname));
		const mimeObj = parseType(contentType);
		if (obj.type == "embed") {
			obj.mime = "text/html";
		} else {
			obj.mime = MediaTyper.format(mimeObj);
			obj.type = mime2type(mimeObj);
		}
		obj.ext = mime.getExtension(obj.mime);

		const contentLength = headers['content-length'];
		if (contentLength != null) {
			obj.size = parseInt(contentLength);
		}
		let disposition = headers['content-disposition'];
		if (disposition != null) {
			debug("got content disposition", disposition);
			if (disposition.startsWith('filename=')) disposition = 'attachment; ' + disposition;
			try {
				disposition = ContentDisposition.parse(disposition);
			} catch (ex) {
				debug("Unknown Content-Disposition format", ex);
			}
			if (disposition && disposition.parameters.filename) {
				urlObj = new URL(disposition.parameters.filename, urlObj);
			}
		}

		const fun = inspectors[obj.type];
		if (urlObj.protocol != "file:") pipeLimit(req, res, fun[1], fun[2]);

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
				canon = new URL(canon, urlObj);
				canon.redirects = (urlObj.redirects || 0) + 1;
			}
			delete obj.canonical;
			delete obj.nocanonical;

			if (fetchEmbed) {
				obj.type = "embed";
				// prevent loops
				obj.noembed = true;
				debug("fetch embed", obj.oembed);
				const urlObjEmbed = new URL(obj.oembed, urlObj);
				urlObjEmbed.headers = Object.assign({}, urlObj.headers);
				if (urlObj.protocol) urlObjEmbed.protocol = urlObj.protocol;
				exports.request(urlObjEmbed, Object.assign({}, obj), (err, cobj, ctags) => {
					if (err) return cb(null, obj, tags);
					cobj.size = obj.size; // embed cannot tell the size
					return cb(null, cobj, ctags);
				});
			} else if (canon && canon.redirects < 5 && canon.pathname != urlObj.pathname && canon.pathname + '/' != urlObj.pathname && canon.pathname != urlObj.pathname + '/') {
				debug("fetch canonical url", canon.href);
				canon.headers = Object.assign({}, urlObj.headers);
				exports.request(canon, obj, (err, cobj, ctags) => {
					if (err) {
						return cb(null, obj, tags);
					} else {
						cobj.location = canon;
						return cb(null, cobj, ctags);
					}
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
			} catch (err) {
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
		curlRequest(urlObj).then(req => {
			const res = req.res;
			if (res.statusCode == 403) {
				req.abort();
				throw new Error(403);
			} else {
				cb(null, req, res);
			}
		}).catch((err) => {
			if (urlObj.headers['User-Agent']) {
				debug("retrying with default curl ua");
				delete urlObj.headers["User-Agent"];
				doRequest(urlObj, cb);
			} else {
				cb(err);
			}
		});
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

function parseType(str) {
	if (!str) return str;
	try {
		const ct = ContentType.parse(str);
		const mt = MediaTyper.parse(ct.type);
		return Object.assign(ct, mt);
	} catch (e) {
		return {};
	}
}

function curlRequest(urlObj) {
	const headersList = Object.entries(urlObj.headers).map(([key, val]) => {
		return `${key}: ${val}`;
	});
	const method = (urlObj.method || "get").toLowerCase();
	const res = new PassThrough();
	return new Promise((resolve, reject) => {
		setImmediate(() => {
			const opts = {
				maxRedirs: 10,
				followLocation: true,
				acceptEncoding: "gzip, deflate, br",
				curlyLowerCaseHeaders: true,
				curlyStreamResponse: method == "get",
				curlyResponseBodyParsers: false,
				httpHeader: headersList
			};
			const proxyUrl = getProxyForUrl(urlObj);
			if (proxyUrl) {
				if (proxyUrl.startsWith('https://')) {
					debug("https proxy", proxyUrl);
					opts.httpProxyTunnel = proxyUrl;
				} else {
					debug("http proxy", proxyUrl);
					opts.proxy = proxyUrl;
				}
			}
			curly[method](urlObj.href, opts).then(({
				headers: hlist,
				data,
				statusCode
			}) => {
				const req = {
					res,
					abort() {
						data.destroy();
					}
				};
				res.headers = {};
				const headers = hlist.pop();
				delete headers.result;
				const last = hlist.pop();
				if (last && last.location) headers.location = last.location;
				res.headers = headers;
				res.statusCode = statusCode;
				if (data.on) data.on('error', (err) => {
					if (err.isCurlError && err.code === CurlCode.CURLE_ABORTED_BY_CALLBACK) {
						// this is expected
					} else {
						throw err;
					}
					res.end();
				});
				if (data.pipe) data.pipe(res);

				resolve(req);
			}).catch(err => {
				reject(err);
			});
		});
	});
}

exports.get = curlRequest;
