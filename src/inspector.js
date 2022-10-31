const Path = require('path');
const { Duration } = require('luxon');

const { Parser } = require("htmlparser2");
const { DomHandler } = require("domhandler");
const { default: DomRender } = require("dom-serializer");
const debug = require('debug')('url-inspector');
const HttpError = require('http-errors');
const OEmbedProviders = require('oembed-providers');
const CustomOEmbedProviders = require('./custom-oembed-providers');
const agent = require('./agent');

const { decodeHTML } = require('entities');

const accepts = {
	image: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
	document: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

module.exports = inspector;

inspector.get = agent.get;
inspector.prepare = function (url, opts) {
	return inspector(url, Object.assign({}, opts, { prepare: true }));
};

async function inspector(url, opts = {}) {

	const urlObj = (url => {
		if (typeof url == "string" && url.startsWith('file:')) {
			return new URL(url.replace(/^file:\/\//, ''), `file://${process.cwd()}/`);
		} else {
			return new URL(url);
		}
	})(url);

	if (urlObj.protocol == "file:") {
		if (!opts.file) {
			throw new HttpError[400]("file: protocol is disabled");
		}
		opts.nofavicon = true;
	}
	urlObj.headers = {};
	const oEmbedUrl = opts.noembed ? {} : supportsOEmbed(urlObj, opts.providers);
	if (oEmbedUrl.redirect) {
		url = urlObj.href;
	}
	if (opts.prepare) return urlObj;
	const obj = await requestPageOrEmbed(urlObj, oEmbedUrl, { url }, opts);
	if (!obj.site) {
		obj.site = urlObj.hostname;
	}
	obj.pathname = urlObj.pathname;
	if (obj.thumbnail) {
		if (Array.isArray(obj.thumbnail)) obj.thumbnail = obj.thumbnail[0];
		const thumbnailObj = new URL(obj.thumbnail, urlObj);
		obj.thumbnail = thumbnailObj.href;
		await lastResortDimensionsFromThumbnail(thumbnailObj, obj);
	}
	if (obj.title == null && urlObj.pathname) {
		obj.title = lexize(Path.basename(urlObj.pathname));
	}
	normalize(obj);
	await sourceInspection(obj, opts);

	if (obj.icon && !obj.icon.startsWith('data:')) {
		obj.icon = new URL(obj.icon, urlObj).href;
	} else if (!opts.nofavicon) {
		await guessIcon(urlObj, obj);
	}
	return obj;
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

function getOrigin(urlObj) {
	const origin = new URL(urlObj);
	origin.pathname = "";
	origin.search = "";
	return origin.href;
}

async function guessIcon(urlObj, obj) {
	if (obj.what == "page") {
		const iconObj = new URL("/favicon.ico", urlObj);
		iconObj.headers = Object.assign({}, urlObj.headers, {
			'Accept': accepts.image,
			'Origin': getOrigin(urlObj)
		});
		const mime = await agent.exists(iconObj);
		if (mime && mime.type == "image") obj.icon = iconObj.href;
	} else {
		const iobj = {
			onlyfavicon: true
		};
		let urlObjRoot = new URL("/", urlObj);
		if (obj.reference) {
			// another url for the same object
			urlObjRoot = new URL(obj.reference);
			obj.site = urlObjRoot.hostname;
			delete obj.reference;
		}
		urlObjRoot.headers = Object.assign({}, urlObj.headers, {
			Accept: accepts.image,
			Origin: getOrigin(urlObjRoot)
		});
		debug("find favicon", urlObjRoot);
		try {
			await agent.request(urlObjRoot, iobj);
		} catch (err) {
			debug("favicon not found", err);
		}
		if (iobj.icon) obj.icon = (new URL(iobj.icon, iobj.location || urlObjRoot)).href;
	}
	return obj;
}

async function requestPageOrEmbed(urlObj, embedObj, obj, opts) {
	if (!embedObj.discovery && embedObj.url) {
		debug("oembed candidate");
		embedObj.obj = new URL(embedObj.url);
		obj.isEmbed = true;
	}
	if (opts.noembed) obj.noembed = true;
	if (opts.nocanonical) obj.nocanonical = true;
	if (opts.error) obj.error = opts.error;

	urlObj.headers = Object.assign({
		"Accept": accepts.document,
		"Accept-Encoding": "gzip, deflate, br",
		"Cache-Control": "no-cache",
		"DNT": "1",
		"Pragma": "no-cache",
		"Upgrade-Insecure-Requests": "1",
		"User-Agent": embedObj.ua || opts.ua || "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36",
	}, urlObj.headers);
	if (embedObj.obj) {
		embedObj.obj.headers = Object.assign({}, urlObj.headers);
	}
	const actualObj = embedObj.obj || urlObj;
	try {
		const robj = await agent.request(actualObj, obj);
		if (typeof embedObj.builder == "function") {
			embedObj.builder(urlObj, robj);
		}
		if (embedObj.obj && !robj.title) {
			// inspect page too
			const sobj = await inspector(urlObj.href, Object.assign({
				noembed: true
			}, opts));
			return Object.assign(sobj, robj);
		} else {
			return robj;
		}
	} catch (err) {
		if (embedObj.obj) {
			return inspector(urlObj.href, Object.assign({
				noembed: true, error: err
			}, opts));
		} else if (embedObj.url) {
			embedObj.discovery = false;
			return requestPageOrEmbed({}, embedObj, obj, opts);
		} else {
			throw err;
		}
	}
}

async function sourceInspection(obj, opts, cb) {
	if (opts.nosource || !obj.source || obj.source == obj.url || ['video', 'audio', 'image', 'page'].includes(obj.what) == false) return obj;
	const urlObj = new URL(obj.source, obj.url);
	if (!urlObj.pathname || !Path.extname(urlObj.pathname)) return obj;
	debug("source inspection", obj.mime, obj.what, obj.source);
	opts = Object.assign({}, opts);
	if (obj.icon) opts.nofavicon = true;
	opts.nosource = true;
	opts.nocanonical = true;
	try {
		const sourceObj = await inspector(obj.source, opts);
		// inspected source is only interesting if it is an embed
		if (sourceObj.what != obj.what || sourceObj.type != 'embed') {
			return obj;
		}
		obj.source = sourceObj.url;
		['mime', 'ext', 'type', 'size', 'width', 'height', 'duration'].forEach(key => {
			if (sourceObj[key]) obj[key] = sourceObj[key];
		});
	} catch (err) {
		debug("Error fetching subsource", err);
	}
	return obj;
}

async function lastResortDimensionsFromThumbnail(thumbnailObj, obj) {
	if (obj.width && obj.height || obj.what != "video") {
		return obj;
	}
	thumbnailObj.headers = {
		Accept: accepts.image,
		Origin: getOrigin(thumbnailObj)
	};
	try {
		const sourceObj = await inspector(thumbnailObj, {
			nofavicon: true,
			nocanonical: true,
			nosource: true
		});
		obj.thumbnail = thumbnailObj.href;
		if (sourceObj.width && sourceObj.height) {
			obj.width = sourceObj.width;
			obj.height = sourceObj.height;
		}
	} catch (err) {
		delete obj.thumbnail;
		debug("Error fetching thumbnail", thumbnailObj.href, err);
	}
	return obj;
}

function findEndpoint(url, list, endpoint = {}) {
	endpoint.last = false;
	if (!list) return endpoint;
	list.find(provider => {
		provider.endpoints.find(point => {
			if (!point.schemes) return;
			if (point.schemes.find(scheme => {
				const reg = scheme instanceof RegExp
					? scheme
					: new RegExp("^" + scheme.replace(/\*/g, ".*") + "$");
				return reg.test(url);
			})) {
				if (point.last === undefined) point.last = true;
				Object.assign(endpoint, point);
				return true;
			}
		});
	});
	return endpoint;
}

function supportsOEmbed(urlObj, providers) {
	const ret = {};
	const url = urlObj.href;
	if (typeof providers == "string") {
		// try to require it
		try {
			providers = require(providers);
		} catch (ex) {
			// eslint-disable-next-line no-console
			console.error("url-inspector missing providers:", providers);
		}
	}
	const endpoint = findEndpoint(url, providers);
	if (!endpoint.last) {
		findEndpoint(url, CustomOEmbedProviders, endpoint);
	}
	if (!endpoint.last) {
		findEndpoint(url, OEmbedProviders, endpoint);
	}
	if (!endpoint.schemes) {
		return ret;
	}
	if (endpoint.builder) ret.builder = endpoint.builder;
	debug("Found oembed provider", endpoint);
	if (endpoint.ua) ret.ua = endpoint.ua;
	if (typeof endpoint.redirect == "function") {
		const redirection = endpoint.redirect(urlObj, ret);
		if (redirection) {
			debug("provider makes a redirection");
			ret.redirect = true;
			return ret;
		}
	}
	if (typeof endpoint.rewrite == "function") {
		const rewrite = endpoint.rewrite(urlObj, ret);
		if (rewrite) {
			debug("provider makes a rewrite");
			return ret;
		}
	}
	// request oembed endpoint
	let formatted = false;
	if (endpoint.url) {
		const epUrl = endpoint.url.replace('{format}', () => {
			formatted = true;
			return 'json';
		});
		const epUrlObj = new URL(epUrl);
		if (!formatted) epUrlObj.searchParams.set('format', 'json');
		epUrlObj.searchParams.set('url', url);
		ret.url = epUrlObj.href;
	}
	ret.discovery = Boolean(endpoint.discovery);
	debug("OEmbed config", ret);
	return ret;
}

function normalize(obj) {
	delete obj.pathname;

	// obj.ext is already set by mime
	obj.ext = obj.ext.toLowerCase();
	switch (obj.ext) {
		case "jpeg":
			obj.ext = "jpg";
			break;
	}

	if (obj.title) {
		if (typeof obj.title != "string") obj.title = obj.title.toString();
		obj.title = decodeHTML(obj.title);
	}

	if (obj.description) {
		if (typeof obj.description != "string") obj.description = obj.description.toString();
		if (obj.title) obj.description = obj.description.replace(obj.title, "").trim();
		obj.description = decodeHTML(obj.description.split('\n')[0].trim());
	}

	if (obj.site) obj.site = normString(obj.site);
	if (obj.author) obj.author = normString(obj.author);

	normalizeMedia(obj, obj.what);

	normalizeDuration(obj);

	const alt = encodeURI(obj.title);
	const src = obj.source || obj.url;

	if (!obj.source && obj.embed) {
		obj.source = obj.embed;
	}
	if (obj.html) {
		obj.type = 'embed';
		const handler = new DomHandler((error, dom) => {
			let changed = false;
			traverseTree(dom, node => {
				if (node.name == "script") {
					changed = true;
					const src = node.attribs.src;
					if (src) obj.script = src;
					node.type = "text";
					node.data = "";
				}
			});
			if (changed) obj.html = DomRender(dom).trim();
		});
		const parser = new Parser(handler);
		parser.write(obj.html);
		parser.end();
	} else if (obj.embed) {
		obj.type = 'embed';
		obj.html = `<iframe src="${obj.embed}"></iframe>`;
	} else if (obj.ext == "html") {
		obj.type = 'link';
		obj.html = `<a href="${src}">${obj.title}</a>`;
	} else if (obj.what == "image") {
		obj.html = `<img src="${src}" alt="${alt}" />`;
		obj.type = 'image';
	} else if (obj.what == "video") {
		obj.type = 'video';
		obj.html = `<video src="${src}"></video>`;
	} else if (obj.what == "audio") {
		obj.type = 'audio';
		obj.html = `<audio src="${src}"></audio>`;
	} else {
		obj.type = 'link';
		obj.html = `<a href="${src}" target="_blank">${obj.title}</a>`;
	}



	if (obj.image) {
		if (!obj.thumbnail && obj.what != 'image') {
			if (obj.image.url) {
				if (obj.image.type) {
					if (obj.image.type.startsWith('image/')) {
						obj.thumbnail = obj.image.url;
					}
				} else {
					obj.thumbnail = obj.image.url;
				}
			} else {
				obj.thumbnail = obj.image;
			}
		}
		delete obj.image;
	}
	if (obj.audio) delete obj.audio;
	if (obj.video) delete obj.video;
	if (obj.embed) delete obj.embed;
	if (obj.oembed) delete obj.oembed;

	if (obj.date) obj.date = normDate(obj.date);
	if (!obj.date) delete obj.date;

	obj.width = normNum(obj.width);
	obj.height = normNum(obj.height);

	obj.keywords = normKeywords(obj);

	// remove all empty keys
	Object.keys(obj).forEach((key) => {
		const val = obj[key];
		if (val == "" || val == null || (typeof val == 'number' && Number.isNaN(val))) {
			delete obj[key];
		}
	});

	delete obj.location;
	if (obj.size == null && 'size' in obj) delete obj.size;

	if (obj.title && obj.title.includes('\n')) {
		const parts = obj.title.split(/\n+/);
		obj.title = parts.shift();
		if (!obj.description && parts.length > 0) {
			obj.description = parts.join('\n');
		}
	}

	return obj;
}

function normKeywords({ title, keywords }) {
	if (!keywords) return;
	if (typeof keywords == "string") {
		keywords = keywords.split(/[,\s]/g);
	} else if (!Array.isArray(keywords)) {
		console.error("Expected keywords array", title, keywords);
		return;
	}
	const list = [];
	const titleList = (title || "").toLowerCase().split(/\s/g);
	keywords.forEach(str => {
		const num = Number.parseInt(str);
		if (!Number.isNaN(num) && num.toString() == str) return;
		str = String(str).toLowerCase().trim();
		if (str.length >= 4 && !titleList.includes(str)) {
			subPush(list, str);
		}
	});
	return list;
}

function normalizeMedia(obj, what) {
	const info = obj[what];
	delete obj[what];
	if (typeof info == "object") {
		if (info.url) {
			obj.source = info.url;
			if (info.duration) obj.duration = info.duration;
			const attrs = [`src="${info.url}"`];
			if (info.width) {
				attrs.push(`width="${info.width}"`);
				obj.width = info.width;
			}
			if (info.height) {
				attrs.push(`height="${info.height}"`);
				obj.height = info.height;
			}
			if (!info.type) {
				// not really trusted, just consider url shall be source and inspected
			} else if (info.type.startsWith('text/html') || info.type.endsWith('/vnd.facebook.bridge')) {
				obj.html = `<iframe ${attrs.join(' ')}></iframe>`;
			} else if (new RegExp(`^${what}\\/\\w+$`).test(info.type) && obj.type == what) {
				if (what == "image") {
					obj.html = `<img ${attrs.join(' ')} />`;
				} else {
					obj.html = `<${what} ${attrs.join(' ')}></${what}>`;
				}
			}
		}
	} else {
		obj.source = info;
	}
}

function normalizeDuration(obj) {
	let duree = obj.duration;
	if (obj.bitrate && !duree && obj.size) {
		const rate = parseInt(obj.bitrate) * 1000 / 8;
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
}

function subPush(list, str) {
	let found = false;
	list.forEach((item, i) => {
		if (item.includes(str)) {
			found = true;
		} else if (str.includes(item)) {
			found = true;
			list[i] = str;
		}
	});
	if (!found) list.push(str);
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
	if (typeof str != "string") str = str.toString();
	return decodeHTML(str.replace(/^@/, '').replace(/_/g, ' '));
}

function traverseTree(node, i, visitor) {
	if (visitor === undefined && i !== null) {
		visitor = i;
		i = null;
	}
	if (Array.isArray(node)) {
		node.forEach((child, i) => traverseTree(child, i, visitor));
		return;
	}
	if (visitor(node, i) === false) {
		return false;
	} else {
		let i, childNode;
		if (node.children !== undefined) {
			i = 0;
			childNode = node.children[i];
		}
		while (childNode !== undefined) {
			if (traverseTree(childNode, i, visitor) === false) {
				return false;
			} else {
				childNode = node.children[++i];
			}
		}
	}
}
