import dataUri from 'strong-data-uri';
import { DateTime } from 'luxon';
import importTags from './tags.js';
import Streat from 'streat';

const streat = new Streat();
streat.start();

export async function media(obj, res) {
	const tags = await streat.run(res, {
		step: res.local ? Infinity : 0
	});
	importTags(tags, obj, {
		imagewidth: 'width',
		imageheight: 'height',
		duration: 'duration',
		format: 'mime',
		mimetype: 'mime',
		filetypeextension: 'ext',
		extension: 'ext',
		title: 'title',
		artist: 'artist',
		album: 'album',
		objectname: 'title',
		audiobitrate: 'bitrate',
		creator: 'author',
		credit: 'author',
		imagedescription: 'description',
		description: 'description',
		modifydate: 'date',
		datetimecreated: 'date',
		datetimeoriginal: 'date',
		referenceurl: 'reference',
		'caption-abstract': 'description',
		keywords: 'keywords'
	});

	if (!obj.thumbnail && tags.Picture && tags.PictureMIMEType) {
		obj.thumbnail = dataUri.encode(
			Buffer.from(tags.Picture.replace(/^base64:/, ''), 'base64'),
			tags.PictureMIMEType
		);
	}
	if (obj.title && obj.artist && (String(obj.title)).indexOf(obj.artist) < 0) {
		obj.title = obj.title + ' - ' + obj.artist;
		delete obj.artist;
	}
	if (obj.date) {
		const exifDate = parseExifDate(obj.date);
		if (exifDate) obj.date = exifDate;
		else delete obj.date;
	}
	return tags;
}

export async function file(obj, res) {
	const tags = await streat.run(res);
	importTags(tags, obj, {
		mimetype: 'mime',
		extension: 'ext',
		filetypeextension: 'ext',
		title: 'title'
		//,pagecount: 'pages'
	});
	return tags;
}

function parseExifDate(str) {
	const [date, time] = str.split(" ");
	if (date) str = date.replace(/:/g, '-') + 'T' + time;

	const dt = DateTime.fromISO(str, {
		zone: 'utc'
	});
	if (!dt.isValid) return;
	return dt.toISO({
		suppressMilliseconds: true,
		suppressSeconds: true
	});
}
