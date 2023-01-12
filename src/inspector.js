import Debug from 'debug';
import HttpError from 'http-errors';
import processProvider from './provider.js';
import sourceInspection from './source.js';

import * as agent from './agent.js';
import Norm from './norm.js';

const debug = Debug('url-inspector');

export default class Inspector {
	static accepts = {
		image: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
		document: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
	};
	static get(urlObj) {
		return agent.get(urlObj);
	}
	constructor(opts = {}) {
		this.providers = opts.providers;
		this.nofavicon = opts.nofavicon;
		this.file = opts.file;
		this.noembed = opts.noembed;
	}

	norm(obj) {
		const [urlObj] = this.prepareUrl(obj);
		Norm.process(obj, urlObj);
		return obj;
	}

	async look(url) {
		const pObj = { url };
		const [urlObj, oEmbedUrl] = this.prepareUrl(pObj);
		const obj = await this.requestPageOrEmbed(urlObj, oEmbedUrl, pObj);
		if (obj.thumbnail) {
			if (Array.isArray(obj.thumbnail)) obj.thumbnail = obj.thumbnail[0];
			const thumbnailObj = new URL(obj.thumbnail, urlObj);
			obj.thumbnail = thumbnailObj.href;
			await this.lastResortDimensionsFromThumbnail(thumbnailObj, obj);
		}
		if (obj.icon && !obj.icon.startsWith('data:')) {
			obj.icon = new URL(obj.icon, urlObj).href;
		} else if (!this.nofavicon || urlObj.protocol == "file:") {
			await this.guessIcon(urlObj, obj);
		}
		Norm.process(obj, urlObj);
		if (!this.nosource) await sourceInspection(obj, this);
		return obj;
	}

	prepareUrl(obj) {
		if (!obj.url) return [{}];
		const urlObj = (url => {
			if (typeof url == "string" && url.startsWith('file:')) {
				return new URL(url.replace(/^file:\/\//, ''), `file://${process.cwd()}/`);
			} else {
				return new URL(url);
			}
		})(obj.url);

		if (urlObj.protocol == "file:") {
			if (!this.file) {
				throw new HttpError[400]("file: protocol is disabled");
			}
		}
		urlObj.headers = {};
		const oEmbedUrl = this.noembed ? {} : processProvider(urlObj, this.providers);
		if (oEmbedUrl.redirect) obj.url = urlObj.href;
		return [urlObj, oEmbedUrl];
	}

	async lastResortDimensionsFromThumbnail(thumbnailObj, obj) {
		if (obj.width && obj.height || obj.what != "video") {
			return obj;
		}
		thumbnailObj.headers = {
			Accept: Inspector.accepts.image,
			Origin: Norm.origin(thumbnailObj)
		};
		try {
			const sourceObj = await this.requestPageOrEmbed(thumbnailObj, {}, {}, {
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


	async guessIcon(urlObj, obj) {
		if (obj.what == "page") {
			const iconObj = new URL("/favicon.ico", urlObj);
			iconObj.headers = Object.assign({}, urlObj.headers, {
				'Accept': Inspector.accepts.image,
				'Origin': Norm.origin(urlObj)
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
				Accept: Inspector.accepts.image,
				Origin: Norm.origin(urlObjRoot)
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

	async requestPageOrEmbed(urlObj, embedObj, obj, opts = this) {
		if (!embedObj.discovery && embedObj.url) {
			debug("oembed candidate");
			embedObj.obj = new URL(embedObj.url);
			obj.isEmbed = true;
		}
		if (opts.noembed) obj.noembed = true;
		if (opts.nocanonical) obj.nocanonical = true;
		if (opts.error) obj.error = opts.error;

		urlObj.headers = Object.assign({
			"Accept": Inspector.accepts.document,
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
				const inspector = new Inspector(Object.assign({}, opts, {
					noembed: true
				}));
				const sobj = await inspector.look(urlObj.href);
				return Object.assign(sobj, robj);
			} else {
				return robj;
			}
		} catch (err) {
			if (embedObj.obj) {
				const inspector = new Inspector(Object.assign({}, opts, {
					noembed: true, error: err
				}));
				return inspector.look(urlObj.href);
			} else if (embedObj.url) {
				embedObj.discovery = false;
				return this.requestPageOrEmbed({}, embedObj, obj, opts);
			} else {
				throw err;
			}
		}
	}
}
