const importTags = require('./tags');
const BufferList = require('bl');

exports.embed = function (obj, res, cb) {
	res.pipe(BufferList(function (err, data) {
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
			url: 'url',
			provider_name: 'site',
			author_name: 'author',
			description: 'description',
			duration: 'duration',
			date: 'upload_date'
		});
		if (obj.type == "photo") obj.type = "image";
		else if (obj.type == "rich" || !obj.type) obj.type = "embed";
		cb(null, tags);
	}));
};
