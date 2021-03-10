module.exports = importTags;

function importTags(tags, obj, map, priorities = {}, priority = 0) {
	let val, tag, itag, key;
	for (tag in tags) {
		val = tags[tag];
		if (!val) continue;
		itag = tag.toLowerCase();
		key = map ? map[itag] : itag;
		if (key === undefined) continue;
		if (!Array.isArray(val)) val = [val];
		const list = [];
		val.map(val => {
			if (typeof key == "string") {
				list.push(val);
			} else {
				importTags(val, obj, key, priorities, priority);
			}
		});
		delete tags[tag];
		if (list.length) {
			if (!priorities[key] || priorities[key] < priority) {
				priorities[key] = priority;
				obj[key] = list.join(', ');
			}
		}
	}
}
