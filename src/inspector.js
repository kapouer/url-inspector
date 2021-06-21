const URL = require('url');
const Path = require('path');
const { Duration } = require('luxon');

const parse5 = require('parse5');
const debug = require('debug')('url-inspector');
const OEmbedProviders = require('@kapouer/oembed-providers');
const CustomOEmbedProviders = require('./custom-oembed-providers');
const agent = require('./agent');

const { decodeHTML } = require('entities');



module.exports = inspector;

function inspector(url, opts, cb) {
	if (typeof opts == "function" && !cb) {
		cb = opts;
		opts = null;
	}
	if (!opts) {
		opts = {};
	}
	const obj = {
		url: URL.format(URL.parse(url))
	};

	const urlObj = URL.parse(obj.url);
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
	const oEmbedUrl = opts.noembed ? {} : supportsOEmbed(urlObj, opts.providers);

	requestPageOrEmbed(urlObj, oEmbedUrl, obj, opts, function (err, obj, tags) {
		if (err) return cb(err);
		if (!obj) return cb(400);

		if (!obj.site) {
			obj.site = urlObj.hostname;
		}
		obj.pathname = urlObj.pathname;

		cb = sourceInspection(obj, opts, cb);

		const urlFmt = URL.format(urlObj);
		if (obj.thumbnail) {
			if (Array.isArray(obj.thumbnail)) obj.thumbnail = obj.thumbnail[0];
			obj.thumbnail = URL.resolve(urlFmt, obj.thumbnail);
			cb = lastResortDimensionsFromThumbnail(obj, cb);
		}

		normalize(obj);

		if (opts.all && tags) obj.all = tags;

		if (obj.icon) {
			obj.icon = URL.resolve(urlFmt, obj.icon);
			cb(null, obj);
		} else if (opts.nofavicon) {
			cb(null, obj);
		} else {
			guessIcon(urlObj, obj, cb);
		}
	});
}

function guessIcon(urlObj, obj, cb) {
	if (obj.ext == "html") {
		const iconObj = {
			hostname: urlObj.hostname,
			port: urlObj.port,
			protocol: urlObj.protocol,
			pathname: '/favicon.ico',
			headers: Object.assign({}, urlObj.headers)
		};
		agent.exists(iconObj, function (yes) {
			if (yes) obj.icon = URL.format(iconObj);
			cb(null, obj);
		});
	} else {
		const iobj = {
			onlyfavicon: true
		};
		let urlRef = urlObj;
		if (obj.reference) {
			// another url for the same object
			urlRef = URL.parse(obj.reference);
			obj.site = urlRef.hostname;
			delete obj.reference;
		}
		const urlObjRoot = {
			hostname: urlRef.hostname,
			port: urlRef.port,
			protocol: urlRef.protocol,
			headers: Object.assign({}, urlObj.headers)
		};
		debug("find favicon", urlObjRoot);
		agent.request(urlObjRoot, iobj, function (err) {
			if (err) debug("favicon not found", err);
			if (iobj.icon) obj.icon = URL.resolve(URL.format(urlObjRoot), iobj.icon);
			cb(null, obj);
		});
	}
}

function requestPageOrEmbed(urlObj, embedObj, obj, opts, cb) {
	if (!embedObj.discovery && embedObj.url) {
		debug("oembed candidate");
		embedObj.obj = URL.parse(embedObj.url);
		obj.type = "embed";
		obj.mime = "text/html";
	}
	if (opts.noembed) obj.noembed = true;
	if (opts.nocanonical) obj.nocanonical = true;
	if (opts.error) obj.error = opts.error;
	urlObj.headers = Object.assign({
		"User-Agent": embedObj.ua || opts.ua || "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
		"Accept-Encoding": "identity",
		"Accept": "*/*"
	}, urlObj.headers);
	if (embedObj.obj) embedObj.obj.headers = Object.assign({}, urlObj.headers);
	const actualObj = embedObj.obj || urlObj;
	agent.request(actualObj, obj, function (err, robj, tags) {
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
			embedObj.builder(urlObj, robj, tags);
		}
		cb(null, robj, tags);
	});
}

function sourceInspection(obj, opts, cb) {
	if (opts.nosource || !obj.source || obj.ext != "html" || obj.source == obj.url || /video|audio|image/.test(obj.type) == false) return cb;
	const urlObj = URL.parse(obj.source);
	if (!urlObj.pathname || !Path.extname(urlObj.pathname)) return cb;
	debug("source inspection", obj.mime, obj.type, obj.source);
	return function (err, obj) {
		if (err) return cb(err, obj);
		opts = Object.assign({}, opts);
		if (obj.icon) opts.nofavicon = true;
		opts.nosource = true;
		opts.nocanonical = true;
		inspector(obj.source, opts, function (err, sourceObj) {
			if (err) {
				debug("Error fetching subsource", err);
				return cb(null, obj);
			}
			if (sourceObj.type != obj.type) return cb(null, obj);
			obj.source = sourceObj.url;
			['mime', 'ext', 'type', 'size', 'width', 'height', 'duration'].forEach(function (key) {
				if (sourceObj[key]) obj[key] = sourceObj[key];
			});
			cb(null, obj);
		});
	};
}

function lastResortDimensionsFromThumbnail(obj, cb) {
	return function (err, obj) {
		if (err) return cb(err);
		if (!obj.thumbnail || obj.width && obj.height || obj.type != "video") {
			return cb(null, obj);
		}
		inspector(obj.thumbnail, {
			nofavicon: true,
			nocanonical: true,
			nosource: true
		}, function (err, sourceObj) {
			if (err) {
				debug("Error fetching thumbnail", obj.thumbnail, err);
				delete obj.thumbnail;
				return cb(null, obj);
			}
			if (sourceObj.width && sourceObj.height) {
				obj.width = sourceObj.width;
				obj.height = sourceObj.height;
			}
			cb(null, obj);
		});
	};
}

function findEndpoint(url, list) {
	let endpoint;
	list.find(function (provider) {
		provider.endpoints.find(function (point) {
			if (!point.schemes) return;
			if (point.schemes.find(function (scheme) {
				const reg = scheme instanceof RegExp
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
	let endpoint = providers && findEndpoint(url, providers);
	if (!endpoint) endpoint = findEndpoint(url, CustomOEmbedProviders);
	if (!endpoint) endpoint = findEndpoint(url, OEmbedProviders);
	if (!endpoint) {
		return ret;
	}
	if (endpoint.builder) ret.builder = endpoint.builder;
	debug("Found oembed provider", endpoint);
	if (endpoint.ua) ret.ua = endpoint.ua;
	if (typeof endpoint.redirect == "function") {
		const redirection = endpoint.redirect(urlObj, ret);
		if (redirection) {
			debug("provider makes a redirection");
			return ret;
		}
	}
	// request oembed endpoint
	let formatted = false;
	if (endpoint.url) {
		const epUrl = endpoint.url.replace('{format}', function () {
			formatted = true;
			return 'json';
		});
		const epUrlObj = URL.parse(epUrl, true);
		if (!formatted) epUrlObj.query.format = 'json';
		epUrlObj.query.url = url;
		delete epUrlObj.search;
		ret.url = URL.format(epUrlObj);
	}
	ret.discovery = !!endpoint.discovery;
	debug("OEmbed config", ret);
	return ret;
}

function normalize(obj) {
	if (!obj.ext) {
		// eslint-disable-next-line no-console
		console.warn("Using extname", obj.pathname);
		obj.ext = Path.extname(obj.pathname).substring(1);
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

	if (obj.title) obj.title = decodeHTML(obj.title);

	if (obj.description) {
		if (obj.title) obj.description = obj.description.replace(obj.title, "").trim();
		obj.description = decodeHTML(obj.description.split('\n')[0].trim());
	}

	if (obj.type == "embed") delete obj.size;

	if (obj.site) obj.site = normString(obj.site);
	if (obj.author) obj.author = normString(obj.author);

	const alt = encodeURI(obj.title);

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
		const src = obj.source || obj.url;
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
	} else {
		const frag = parse5.parseFragment(obj.html);
		let changed = false;
		traverseTree(frag, (node, i) => {
			if (node.nodeName == "script") {
				changed = true;
				const src = node.attrs.find(attrs => attrs.name == "src");
				if (src && src.value) obj.script = src.value;
				node.parentNode.childNodes[i] = {
					nodeName: '#text',
					value: ''
				};
			}
		});
		if (changed) obj.html = parse5.serialize(frag);
	}
	if (obj.date) obj.date = normDate(obj.date);
	if (!obj.date) delete obj.date;

	obj.width = normNum(obj.width);
	obj.height = normNum(obj.height);

	obj.keywords = normKeywords(obj);

	// remove all empty keys
	Object.keys(obj).forEach(function (key) {
		const val = obj[key];
		if (val == "" || val == null || (typeof val == 'number' && Number.isNaN(val))) {
			delete obj[key];
		}
	});

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
		str = str.toLowerCase().trim();
		const num = Number.parseInt(str);
		if (!Number.isNaN(num) && num.toString() == str) return;
		if (str.length >= 4 && !titleList.includes(str)) {
			subPush(list, str);
		}
	});
	return list;
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
	return decodeHTML(str.replace(/^@/, '').replace(/_/g, ' '));
}

function traverseTree(node, i, cb) {
	if (cb === undefined && i !== null) {
		cb = i;
		i = null;
	}
	if (cb(node, i) === false) {
		return false;
	} else {
		let i, childNode;
		if (node.childNodes !== undefined) {
			i = 0;
			childNode = node.childNodes[i];
		}
		while (childNode !== undefined) {
			if (traverseTree(childNode, i, cb) === false) {
				return false;
			} else {
				childNode = node.childNodes[++i];
			}
		}
	}
}
