import { createRequire } from "module";
import CustomOEmbedProviders from './custom-oembed-providers.js';
import Debug from 'debug';
const debug = Debug('url-inspector');

const require = createRequire(import.meta.url);
const OEmbedProviders = require("oembed-providers");

export default function processProvider(urlObj, providers) {
	const ret = {};
	const url = urlObj.href;
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
