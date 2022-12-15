const Path = require('path');
const debug = require('debug')('url-inspector');
const Inspector = require('./inspector');

module.exports = async function (obj, opts) {
	if (!obj.source || obj.source == obj.url || ['video', 'audio', 'image', 'page'].includes(obj.what) == false) return obj;
	const urlObj = new URL(obj.source, obj.url);
	if (!urlObj.pathname || !Path.extname(urlObj.pathname)) return obj;
	debug("source inspection", obj.mime, obj.what, obj.source);
	opts = Object.assign({}, opts);
	if (obj.icon) opts.nofavicon = true;
	opts.nosource = true;
	opts.nocanonical = true;
	try {
		const inspector = new Inspector(opts);
		const sourceObj = await inspector.look(obj.source);
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
};
