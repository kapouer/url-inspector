const importTags = require('./tags');
const BufferList = require('bl');

exports.embed = function (obj, res, cb) {
	res.pipe(BufferList((err, data) => {
		if (err) return cb(err);
		let tags;
		try {
			data = data.toString();
			tags = JSON.parse(data);
		} catch (ex) {
			console.error(data);
			if (ex) return cb(ex);
		}
		importTags(tags, obj, {
			type: 'type',
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
		switch (obj.type) {
			case "photo":
				obj.type = "image";
				break;
			case "video":
				break;
			default:
				obj.type = "page";
		}
		obj.mime = "text/html";
		obj.ext = "html";
		obj.use = "embed";
		delete obj.isEmbed;
		delete obj.size;
		cb(null, tags);
	}));
};
