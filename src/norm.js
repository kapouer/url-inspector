const { Duration } = require('luxon');
const Path = require('path');
const { Parser } = require("htmlparser2");
const { DomHandler } = require("domhandler");
const { default: DomRender } = require("dom-serializer");

module.exports = class Norm {
	static lexize(str) {
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

	static origin(urlObj) {
		const origin = new URL(urlObj);
		origin.pathname = "";
		origin.search = "";
		return origin.href;
	}

	static process(obj, urlObj) {
		if (!obj.site) {
			obj.site = urlObj.hostname;
		}

		// obj.ext is already set by mime
		obj.ext = obj.ext.toLowerCase();
		switch (obj.ext) {
			case "jpeg":
				obj.ext = "jpg";
				break;
		}

		if (obj.title) {
			if (typeof obj.title != "string") {
				obj.title = obj.title.toString();
			}
			obj.title = Norm.htmlToString(obj.title);
		} else if (urlObj.pathname) {
			obj.title = Norm.lexize(Path.basename(urlObj.pathname));
		}
		if (obj.description) {
			if (typeof obj.description != "string") {
				obj.description = obj.description.toString();
			}
			if (obj.title) {
				obj.description = obj.description.replace(obj.title, "").trim();
			}
			obj.description = Norm.htmlToString(obj.description).split('\n')[0].trim();
		}

		if (obj.site) obj.site = Norm.string(Norm.htmlToString(obj.site));
		if (obj.author) obj.author = Norm.string(Norm.htmlToString(obj.author));

		Norm.media(obj, obj.what);

		Norm.duration(obj);

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

		if (obj.date) obj.date = Norm.date(obj.date);
		if (!obj.date) delete obj.date;

		obj.width = Norm.num(obj.width);
		obj.height = Norm.num(obj.height);

		obj.keywords = Norm.keywords(obj);

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

	static keywords({ title, keywords }) {
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

	static media(obj, what) {
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

	static duration(obj) {
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



	static date(str) {
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

	static num(str) {
		const n = parseFloat(str);
		return Number.isNaN(n) ? undefined : n;
	}

	static htmlToString(str) {
		const parts = [];
		const parser = new Parser({
			ontext(str) {
				parts.push(str);
			}
		});
		parser.write(str);
		parser.end();
		return parts.join('').trim();
	}

	static string(str) {
		return str.replace(/^@/, '').replace(/_/g, ' ');
	}
};


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
