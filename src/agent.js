import { basename } from 'path';
import ContentDisposition from 'content-disposition';
import ContentType from 'content-type';
import MediaTyper from 'media-typer';
import iconv from 'iconv-lite';
import mime from 'mime';
import { createReadStream, promises as fs } from 'fs';

import { PassThrough } from 'stream';
import Debug from 'debug';

import { curly, CurlCode } from 'node-libcurl';
import { getProxyForUrl } from 'proxy-from-env';
import HttpError from 'http-errors';

import * as inspectSax from './sax.js';
import * as inspectEmbed from './embed.js';
import * as inspectStreat from './streat.js';

const debug = Debug('url-inspector');

const archiveTypes = [
	"x-tar",
	"x-archive",
	"x-brotli",
	"x-bz2",
	"x-lzma",
	"x-lzip",
	"gzip",
	"x-xz",
	"x-compress",
	"zstd",
	"x-7z-compressed",
	"x-arj",
	"x-rar-compressed",
	"x-gtar",
	"zip"
];

// maximum bytes to download for each type of data
const inspectors = {
	embed: [inspectEmbed.embed, 30000],
	svg: [inspectSax.svg, 30000],
	image: [inspectStreat.media, 128000, 0.1],
	audio: [inspectStreat.media, 200000, 0.1],
	video: [inspectStreat.media, 512000, 0.1],
	html: [inspectSax.html, 512000],
	file: [inspectStreat.file, 32000],
	archive: [async (obj, res) => {
		return obj;
	}, 0]
};

export async function exists(urlObj) {
	urlObj.method = 'HEAD';
	try {
		const req = await curlRequest(urlObj);
		const res = req.res;
		const status = res.statusCode;
		debug("remote", urlObj, "returns", status);
		if (status == 204 || res.headers['content-length'] == 0) {
			return false;
		} else if (status >= 200 && status < 400) {
			return parseType(pickHeader(res.headers['content-type']));
		} else {
			return false;
		}
	} catch (err) {
		return false;
	}
}

export async function request(urlObj, obj) {
	debug("request url", urlObj.href);
	const req = await doRequest(urlObj);
	let res = req.res;

	const { statusCode, headers } = res;
	debug("got response status %d", statusCode);

	if (statusCode < 200 || (statusCode >= 400 && statusCode < 600)) {
		// definitely an error - status above 600 could be an anti-bot system
		throw new HttpError[statusCode]("Error fetching: " + urlObj.href);
	}
	if (headers.location) obj.location = new URL(pickHeader(headers.location), urlObj);
	let contentType = pickHeader(headers['content-type']);
	if (!contentType) contentType = mime.getType(basename(urlObj.pathname));
	const mimeObj = parseType(contentType);
	obj.mime = MediaTyper.format(mimeObj);
	obj.what = mime2what(mimeObj);
	obj.ext = mime.getExtension(obj.mime);

	const contentLength = headers['content-length'];
	if (contentLength != null) {
		obj.size = parseInt(contentLength);
	}
	let disposition = pickHeader(headers['content-disposition']);
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

	const fun = inspectors[getInspectorType(obj, mimeObj)];
	if (urlObj.protocol != "file:") pipeLimit(req, res, fun[1], fun[2]);

	debug("(mime, type, length) is (%s, %s, %d)", obj.mime, obj.what, obj.size);
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

	try {
		await fun[0](obj, res);
	} catch (err) {
		if (debug.enabled) throw err;
		else console.error(err);
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

	try {
		if (fetchEmbed) {
			// prevent loops
			obj.noembed = true;
			obj.isEmbed = true;
			debug("fetch embed", obj.oembed);
			const urlObjEmbed = new URL(obj.oembed, urlObj);
			urlObjEmbed.headers = Object.assign({}, urlObj.headers);
			if (urlObj.protocol) urlObjEmbed.protocol = urlObj.protocol;
			const cobj = await request(urlObjEmbed, Object.assign({}, obj));
			cobj.size = obj.size; // embed cannot tell the size
			return cobj;
		} else if (canon && canon.redirects < 5 && canon.pathname != urlObj.pathname && canon.pathname + '/' != urlObj.pathname && canon.pathname != urlObj.pathname + '/') {
			debug("fetch canonical url", canon.href);
			canon.headers = Object.assign({}, urlObj.headers);
			const cobj = await request(canon, obj);
			cobj.location = canon;
			return cobj;
		} else {
			return obj;
		}
	} catch (err) {
		console.error(err);
		return obj;
	}
}

function getInspectorType({ isEmbed }, { type, subtype }) {
	let itype;
	if (subtype == "svg") itype = 'svg';
	else if (["image", "video", "audio"].includes(type)) itype = type;
	else if (/^x?html$/.test(subtype)) itype = 'html';
	else if (subtype == "json") itype = isEmbed ? 'embed' : 'archive';
	else if (archiveTypes.includes(subtype)) itype = 'archive';
	else itype = 'file';
	return itype;
}

async function doRequest(urlObj) {
	if (urlObj.protocol == "file:") {
		const stat = await fs.stat(urlObj.pathname);
		const req = createReadStream(urlObj.pathname).on('error', err => console.error(err));
		if (!req.abort) req.abort = req.destroy;
		req.headers = {
			'content-length': stat.size.toString()
		};
		req.local = true;
		req.res = req;
		return req;
	} else {
		try {
			const req = await curlRequest(urlObj);
			const res = req.res;
			if (res.statusCode == 403) {
				req.abort();
				throw new HttpError[res.statusCode]("Error fetching: " + urlObj.href);
			} else {
				return req;
			}
		} catch (err) {
			if (err.statusCode && urlObj.headers['User-Agent']) {
				debug("retrying with default curl ua");
				delete urlObj.headers["User-Agent"];
				return doRequest(urlObj);
			} else if (err.isCurlError && err.code == CurlCode.CURLE_OPERATION_TIMEOUTED) {
				throw new HttpError[408]("Request Timeout");
			} else {
				throw err;
			}
		}
	}
}

function mime2what(obj) {
	let what = 'file';
	if (obj.subtype == "html") {
		what = 'page';
	} else if (obj.subtype == 'svg') {
		what = 'page';
	} else if (['image', 'audio', 'video'].includes(obj.type)) {
		what = obj.type;
	}
	return what;
}

function pickHeader(str) {
	if (!str) return str;
	const list = str.split(',').map(it => it.trim());
	let m = '';
	for (const item of list) if (item.length > m.length) m = item;
	return m;
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
	res.on('data', buf => {
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

async function curlRequest(urlObj) {
	const headersList = Object.entries(urlObj.headers || {}).map(([key, val]) => {
		return `${key}: ${val}`;
	});
	const method = (urlObj.method || "get").toLowerCase();
	const res = new PassThrough();

	const opts = {
		maxRedirs: 10,
		followLocation: true,
		connectTimeout: 5,
		acceptEncoding: "gzip, deflate, br",
		curlyLowerCaseHeaders: true,
		curlyStreamResponse: method == "get",
		curlyResponseBodyParsers: false,
		sslVerifyPeer: false,
		sslVerifyHost: false,
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

	// workaround https://github.com/JCMais/node-libcurl/issues/332
	await new Promise(resolve => setImmediate(resolve));

	const {
		headers: hlist,
		data,
		statusCode
	} = await curly[method](urlObj.href, opts);
	const req = {
		res,
		abort() {
			data.destroy();
		}
	};
	const headers = hlist.pop();
	delete headers.result;
	const last = hlist.pop();
	if (last && last.location) headers.location = last.location;
	res.headers = headers;
	res.statusCode = statusCode;
	if (data.on) data.on('error', err => {
		res.end();
		if (err.isCurlError && err.code === CurlCode.CURLE_ABORTED_BY_CALLBACK) {
			// this is expected
		} else {
			// rethrow, let curly handle it
			throw err;
		}
	});
	if (data.pipe) data.pipe(res);
	return req;
}

export const get = curlRequest;
