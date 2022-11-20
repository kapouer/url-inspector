const googlemaps = {
	provider_name: "maps.google.com",
	endpoints: [{
		schemes: [
			/.*google\.[^/]+\/maps\/place\/.+/,
			/goo\.gl\/maps\/.+/
		],
		builder: function (urlObj, obj) {
			obj.what = "page";
			obj.html = `<iframe src="//maps.google.com/maps?t=m&q=${encodeURIComponent(obj.title)}&output=embed"></iframe>`;
			obj.site = 'Google Maps';
			const parts = (obj.title || '').split('·');
			if (parts.length >= 2) {
				obj.title = parts.shift().trim();
				obj.description = parts.join('·');
			}
		}
	}]
};

const youtube = {
	provider_name: "youtube.com",
	endpoints: [{
		schemes: [
			'https://*.youtube.com/watch\\?*'
		],
		ua: "AdsBot-Google"
	}, {
		schemes: [
			'https://*.youtube.com/v/*',
			'https://*.youtube.com/embed/*',
			'https://youtu.be/*'
		],
		ua: "AdsBot-Google",
		url: 'https://www.youtube.com/oembed', // TODO ?maxwidth=1024&maxheight=1024
		rewrite: function (obj) {
			if (obj.pathname == "/watch") return;
			let videoId;
			if (obj.pathname.startsWith("/embed/")) {
				videoId = obj.pathname.split('/').pop();
			} else if (obj.hostname == "youtu.be") {
				videoId = obj.pathname.substring(1);
			}
			if (!videoId) return;
			delete obj.href;
			delete obj.pathname;
			delete obj.search;
			delete obj.query;
			obj.path = "/watch?v=" + encodeURIComponent(videoId);
			obj.hostname = "www.youtube.com";
			return true;
		}
	}]
};

const twitter = {
	provider_name: "twitter.com",
	endpoints: [{
		schemes: [
			'https://twitter.com/*/status/*'
		],
		last: false,
		builder: function (urlObj, obj) {
			const {
				groups: { date }
			} = />(?<date>[\w,\s]+)<\/a><\/blockquote>/.exec(obj.html) || { groups: {} };

			if (date) {
				obj.date = new Date(date);
			}
			obj.icon = "https://abs.twimg.com/favicons/twitter.2.ico";
			Object.assign(obj, (/\((?<title>@\w+)\)/.exec(obj.html) || {}).groups);

			const { text } = (/<p[^>]*>(?<text>.*?)<\/p>/.exec(obj.html) || {}).groups || {};
			if (text) {
				obj.description = text
					.replace(/<br>/g, ' ')
					.replace(/\s+/g, ' ')
					.replace(/<a[^>]*>pic\.twitter\.com.*<\/a>/g, '')
					.replace(/<a[^>]*>/g, '')
					.replace(/<\/a>/g, '')
					.replace(/\. .*/g, '.');
			}
			Object.assign(obj, (/\((?<title>@\w+)\)/.exec(obj.html) || {}).groups);
		}
	}]
};

export default [googlemaps, youtube, twitter];

