const debug = require('debug')('url-inspector');
const SAXParser = require('parse5-sax-parser');
const importTags = require('./tags');

exports.html = function (obj, res, cb) {
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
				'og:image': "image",
				'og:audio': "audio",
				'og:video': "video",
				'og:url': "url",
				'og:type': "type",
				'og:site_name': "site",
				'og:video:url': "video",
				'og:audio:url': "audio",
				'og:image:url': "image",
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
				'author': "author",
				'keywords': "keywords"
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

	const parser = new SAXParser();
	const tags = {};
	const priorities = {};
	let curText, curKey, curPriority;
	let curSchemaType, curSchemaLevel;
	let firstSchemaType;
	let curLevel = 0;

	parser.on('startTag', function ({ tagName, attrs, selfClosing }) {
		let name = tagName.toLowerCase();
		if (name == "head") res.nolimit = true;
		if (name == "meta" || name == "link") selfClosing = true;
		if (!selfClosing) curLevel++;
		let key, nkey, atts, val, curatt;
		let selector = selectors[name];
		if (selector && selector.text) {
			key = selector.text;
		} else {
			atts = hashAttributes(attrs);
			val = atts.itemtype;
			if (val) {
				if (curSchemaType && curSchemaLevel < curLevel) {
					debug("ignoring lower level schema", curSchemaType, curSchemaLevel, curLevel);
					return;
				}
				if (/\/.*(Action|Event|Page|Site|Type|Status|Audience)$/.test(val)) return;
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
			if (atts.itemprop) {
				name = 'meta';
				selector = selectors.meta;
			}
		}
		if (!selector) return;
		if (!key) for (curatt in selector) {
			nkey = atts[curatt];
			if (nkey) {
				nkey = selector[curatt][nkey.toLowerCase()];
				if (nkey) key = nkey;
			}
		}
		if (!key) return;
		let mkey, priority = 1;
		if (name == "meta") {
			mkey = 'content';
			priority = 3;
		} else if (name == "link") {
			mkey = 'href';
			priority = 2;
		} else if (!selfClosing) {
			curKey = key;
			curText = "";
			return;
		}
		curPriority = priority;
		val = atts[mkey];
		debug("Tag", name, "has key", key, "with priority", priority, "and value", val, "in attribute", mkey);
		if (mkey && val && (!priorities[key] || priority > priorities[key])) {
			priorities[key] = priority;
			tags[key] = val;
			if (key == "icon" && obj.onlyfavicon) {
				finish();
			}
		}
	});
	parser.on('text', function ({ text }) {
		if (curText != null) curText += text;
	});
	parser.on('endTag', function ({ tagName }) {
		if (tagName == "head") delete res.nolimit;
		if (curSchemaLevel == curLevel) {
			// we finished parsing the content of an embedded Object, abort parsing
			curSchemaLevel = null;
			curSchemaType = null;
			return finish();
		}
		curLevel--;
		if (curText && curKey == "jsonld") {
			importJsonLD(tags, curText, priorities);
		} else if (curText && (!priorities[curKey] || curPriority > priorities[curKey])) {
			debug("Tag", tagName, "has key", curKey, "with text content", curText);
			tags[curKey] = curText;
		}
		curText = null;
		curKey = null;
	});


	res.once('end', finish);

	let finished = false;
	function finish() {
		if (finished) return;
		finished = true;
		parser.stop();
		const type = mapType(tags.type);
		if (type) obj.type = type;
		delete tags.type;
		Object.assign(obj, tags);
		cb();
	}

	res.pipe(parser);
};

exports.svg = function (obj, res, cb) {
	const parser = new SAXParser();
	parser.on('startTag', function ({ tagName, attrs }) {
		if (tagName.toLowerCase() != "svg") return;
		obj.type = "image";
		const box = attrs.find(function (att) {
			return att.name.toLowerCase() == "viewbox";
		}).value;
		if (!box) return cb();
		const parts = box.split(/\s+/);
		if (parts.length == 4) {
			obj.width = parseFloat(parts[2]);
			obj.height = parseFloat(parts[3]);
		}
		cb();
	});
	res.pipe(parser);
};

function hashAttributes(list) {
	let i, att;
	const obj = {};
	for (i = 0; i < list.length; i++) {
		att = list[i];
		if (att.value) obj[att.name.toLowerCase()] = att.value;
	}
	return obj;
}


function importJsonLD(tags, text, priorities) {
	try {
		const obj = JSON.parse(text);
		if (!Array.isArray(obj)) obj = [obj];
		let ld = {};
		obj.forEach((item) => {
			if (!item) return;
			const type = mapType(item["@type"]);
			if (type) {
				ld = item;
				tags.type = type;
				delete ld["@type"];
			}
		});
		importTags(ld, tags, {
			name: "title",
			description: "description",
			embedurl: "source",
			thumbnailurl: "thumbnail",
			datepublished: "date",
			author: { name: "author" },
			duration: "duration"
		}, priorities, 4);
	} catch (ex) {
		// eslint-disable-next-line no-console
		console.error("Cannot parse json-ld, ignoring", ex, text);
	}
}

function mapType(type) {
	if (!type) return type;
	if (/(^|\/|:)(video|movie)/i.test(type)) type = 'video';
	else if (/(^|\/|:)(audio|music)/i.test(type)) type = 'audio';
	else if (/(^|\/|:)(image|photo)/i.test(type)) type = 'image';
	else if (/(^|\/|:)(newsarticle)/i.test(type)) type = 'link';
	else type = null;
	return type;
}

