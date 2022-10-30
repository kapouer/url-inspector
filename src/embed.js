const importTags = require('./tags');
const BufferList = require('bl');
const { Deferred } = require('class-deferred');

exports.embed = async function (obj, res) {
	const defer = new Deferred();
	res.pipe(BufferList((err, data) => {
		if (err) return defer.reject(err);
		else defer.resolve(data);
	}));
	const data = await defer;
	const tags = 	JSON.parse(data.toString());

	importTags(tags, obj, {
		type: 'what',
		title: 'title',
		thumbnail_url: 'thumbnail',
		width: 'width',
		height: 'height',
		html: 'html',
		url: 'source',
		provider_name: 'site',
		author_name: 'author',
		description: 'description',
		duration: 'duration',
		upload_date: 'date'
	});
	switch (obj.what) {
		case "photo":
			obj.what = "image";
			break;
		case "video":
			break;
		default:
			obj.what = "page";
	}
	obj.mime = "text/html";
	obj.ext = "html";
	obj.type = "embed";
	delete obj.isEmbed;
	delete obj.size;
	return tags;
};
