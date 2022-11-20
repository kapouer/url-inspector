import { Deferred } from 'class-deferred';
import { WritableStream } from "htmlparser2/lib/WritableStream";
import importTags from './tags.js';
import Debug from 'debug';
const debug = Debug('url-inspector');

export async function html(obj, res) {
	// collect tags
	const selectors = {
		title: {
			text: "title"
		},
		script: {
			type: {
				"application/ld+json": "jsonld"
			}
		},
		link: {
			rel: {
				icon: "icon",
				'shortcut icon': "icon",
				canonical: "canonical"
			},
			type: {
				"application/json+oembed": "oembed",
				"text/json+oembed": "oembed"
			}
		},
		meta: {
			property: {
				'og:title': "title",
				'og:description': "description",
				'og:image': "image.url",
				'og:audio': "audio.url",
				'og:video': "video.url",
				'og:url': "url",
				'og:type': "type",
				'og:site_name': "site",
				'og:video:url': "video.url",
				'og:video:secure_url': "video.url",
				'og:video:type': "video.type",
				'og:video:width': "video.width",
				'og:video:height': "video.height",
				'og:video:duration': "video.duration",
				'video:duration': "video.duration",
				'og:audio:url': "audio.url",
				'og:audio:secure_url': "audio.url",
				'og:audio:type': "audio.type",
				'og:audio:duration': "audio.duration",
				'audio:duration': "audio.duration",
				'og:image:url': "image.url",
				'og:image:secure_url': "image.url",
				'og:image:type': "image.type",
				'og:image:width': "image.width",
				'og:image:height': "image.height",
				'article:published_time': "date"
			},
			name: {
				'twitter:title': "title",
				'twitter:description': "description",
				'twitter:image': "thumbnail",
				'twitter:url': "url",
				'twitter:site': "site",
				'twitter:type': "type",
				'twitter:creator': "author",
				'twitter:player': "video.url",
				'twitter:player:width': "video.width",
				'twitter:player:height': "video.height",
				'author': "author",
				'keywords': "keywords",
				'description': "description"
			},
			itemprop: {
				name: "title",
				description: "description",
				duration: "duration",
				image: "image", // give priority to thumbnailurl when defined on same node
				thumbnailurl: "thumbnail",
				embedurl: "embed",
				width: "width",
				height: "height",
				datepublished: "date"
			}
		}
	};

	const tags = {};
	const priorities = {};
	let curText, curKey, curPriority;
	let curSchemaType, curSchemaLevel;
	let firstSchemaType;
	let curLevel = 0;

	const parserStream = new WritableStream({
		onopentag(tagName, attrs) {
			let name = tagName.toLowerCase();
			if (name == "head") res.nolimit = true;
			const selfClosing = name == "meta" || name == "link";
			if (!selfClosing) curLevel++;
			let key, nkey, val, curatt;
			let selector = selectors[name];
			if (selector && selector.text) {
				key = selector.text;
			} else {
				val = attrs.itemtype || attrs.itemType;
				if (val) {
					if (curSchemaType && curSchemaLevel < curLevel) {
						debug("ignoring lower level schema", curSchemaType, curSchemaLevel, curLevel);
						return;
					}
					if (/\/.*(Action|Event|Page|Site|Type|Status|Audience|List|ListItem)$/.test(val)) return;
					debug("schema type", val);
					// the page can declares several itemtype
					// the order in which they appear is important
					// nonWebPage + embedType -> ignore embedType
					// WebPage (or nothing) + embedType -> embedType is the type of the page
					curSchemaType = val;
					curSchemaLevel = curLevel;
					if (!firstSchemaType) {
						firstSchemaType = curSchemaType;
						tags.type = val;
					}
					return;
				}
				if (attrs.itemprop || attrs.itemProp) {
					name = 'meta';
					selector = selectors.meta;
				}
			}
			if (!selector) {
				return;
			}
			const lattrs = lowerCaseObj(attrs);
			if (!key) for (curatt in selector) {
				nkey = lattrs[curatt];
				if (nkey) {
					nkey = selector[curatt][nkey.toLowerCase()];
					if (nkey) key = nkey;
				}
			}
			if (!key) {
				return;
			}
			let mkey, priority = 1;
			if (name == "meta") {
				mkey = 'content';
				priority = 3;
			} else if (name == "link") {
				mkey = 'href';
				priority = 2;
			} else {
				curKey = key;
				curText = "";
				return;
			}
			curPriority = priority;
			val = lattrs[mkey];
			debug("Tag", name, "has key", key, "with priority", priority, "and value", val, "in attribute", mkey);
			if (mkey && val && (!priorities[key] || priority > priorities[key])) {
				priorities[key] = priority;
				const [keyGroup, keyName] = key.split('.');
				if (keyName) {
					if (!tags[keyGroup]) tags[keyGroup] = {};
					tags[keyGroup][keyName] = val;
				} else {
					tags[key] = val;
				}
				if (key == "icon" && obj.onlyfavicon) {
					finish();
				}
			}
		},
		ontext(text) {
			if (curText != null) curText += text;
		},
		onclosetag(tagName) {
			if (tagName == "meta") return;
			if (tagName == "head") delete res.nolimit;
			if (curSchemaLevel == curLevel) {
				// we finished parsing the content of an embedded Object, abort parsing
				curSchemaLevel = null;
				curSchemaType = null;
				return finish();
			}
			curLevel--;
			if (curText && curKey == "jsonld") {
				try {
					importJsonLD(tags, curText, priorities);
				} catch (err) {
					finish(err);
				}
			} else if (curText && (!priorities[curKey] || curPriority > priorities[curKey])) {
				debug("Tag", tagName, "has key", curKey, "with text content", curText);
				tags[curKey] = curText;
			}
			curText = null;
			curKey = null;
		},
		onerror: finish
	});

	res.once('close', finish);
	res.once('aborted', finish);
	res.once('finish', finish);

	let finished = false;
	const defer = new Deferred();

	function finish(err) {
		if (err) console.error(err);
		if (finished) return;
		finished = true;
		const type = mapWhat(tags.type);
		if (type) obj.what = type;
		delete tags.type;
		Object.assign(obj, tags);
		defer.resolve();
	}

	res.pipe(parserStream);
	return defer;
}

export async function svg(obj, res) {
	const parserStream = new WritableStream({
		onopentag(tagName, attrs) {
			if (tagName.toLowerCase() != "svg") return;
			obj.type = "image";
			obj.what = "image";
			const box = attrs.viewbox || attrs.viewBox;
			if (box) {
				const parts = box.split(/\s+/);
				if (parts.length == 4) {
					obj.width = parseFloat(parts[2]);
					obj.height = parseFloat(parts[3]);
				}
			}
			finish();
		},
		onerror(err) {
			finish(err);
		}
	});

	res.once('close', finish);
	res.once('aborted', finish);
	res.once('finish', finish);

	let finished = false;
	const d = new Deferred();

	function finish() {
		if (finished) return;
		finished = true;
		d.resolve();
	}
	res.pipe(parserStream);
	return d;
}

function importJsonLD(tags, text, priorities) {
	try {
		const obj = typeof text == "string" ? JSON.parse(text.replace(/\n/g, '')) : text;
		let ld = {};
		(Array.isArray(obj) ? obj : [obj]).forEach((item) => {
			if (!item) return;
			const type = item["@type"];
			if (!type) return;
			const knownType = mapWhat(type);
			if (knownType) {
				ld = item;
				tags.type = knownType;
				delete ld["@type"];
			} else {
				for (const key in item) {
					const val = item[key];
					if (val && typeof val == "object" && val["@type"]) {
						importJsonLD(tags, val, priorities);
					}
				}
			}
		});
		importTags(ld, tags, {
			name: "title",
			description: "description",
			embedurl: "embed",
			thumbnailurl: "thumbnail",
			datepublished: "date",
			uploaddate: "date",
			author: { name: "author" },
			publisher: { name: "author" },
			duration: "duration"
		}, priorities, 4);
	} catch (ex) {
		ex.message += " in\n" + text;
		throw ex;
	}
}

function mapWhat(type) {
	if (!type) return type;
	if (/(^|\/|:)(video|movie)/i.test(type)) type = 'video';
	else if (/(^|\/|:)(audio|music)/i.test(type)) type = 'audio';
	else if (/(^|\/|:)(image|photo)/i.test(type)) type = 'image';
	else if (/(^|\/|:)(newsarticle)/i.test(type)) type = 'page';
	else type = null;
	return type;
}

function lowerCaseObj(obj) {
	const ret = {};
	for (const key in obj) ret[key.toLowerCase()] = obj[key];
	return ret;
}
