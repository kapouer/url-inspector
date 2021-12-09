const importTags = require('./tags');
const BufferList = require('bl');

exports.embed = function (obj, res, cb) {
	res.pipe(BufferList((err, data) => {
		if (err) return cb(err);
		let tags;
		try {
			tags = JSON.parse(data.toString());
		} catch (ex) {
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
		if (obj.type == "photo") obj.type = "image";
		else if (obj.type == "rich" || !obj.type) obj.type = "embed";
		cb(null, tags);
	}));
};
