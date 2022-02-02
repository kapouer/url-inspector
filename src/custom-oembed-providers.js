const googlemaps = {
	provider_name: "maps.google.com",
	endpoints: [{
		schemes: [
			/.*google\.[^/]+\/maps\/place\/.+/,
			/goo\.gl\/maps\/.+/
		],
		builder: function (urlObj, obj) {
			obj.type = "embed";
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

			const { text } = (/<p[^>]*>(?<text>.*?)(<a\s|<\/p>)/.exec(obj.html) || {}).groups || {};
			if (text) {
				obj.description = text.replace(/<br>/g, ' ').replace(/\s+/g, ' ');
			}
			Object.assign(obj, (/\((?<title>@\w+)\)/.exec(obj.html) || {}).groups);
		}
	}]
};

const instagram = {
	provider_name: "instagram",
	endpoints: [{
		"schemes": [
			"http://instagram.com/*/p/*,",
			"http://www.instagram.com/*/p/*,",
			"https://instagram.com/*/p/*,",
			"https://www.instagram.com/*/p/*,",
			"http://instagram.com/p/*",
			"http://instagr.am/p/*",
			"http://www.instagram.com/p/*",
			"http://www.instagr.am/p/*",
			"https://instagram.com/p/*",
			"https://instagr.am/p/*",
			"https://www.instagram.com/p/*",
			"https://www.instagr.am/p/*",
			"http://instagram.com/tv/*",
			"http://instagr.am/tv/*",
			"http://www.instagram.com/tv/*",
			"http://www.instagr.am/tv/*",
			"https://instagram.com/tv/*",
			"https://instagr.am/tv/*",
			"https://www.instagram.com/tv/*",
			"https://www.instagr.am/tv/*",
			"http://www.instagram.com/reel/*",
			"https://www.instagram.com/reel/*",
			"http://instagram.com/reel/*",
			"https://instagram.com/reel/*",
			"http://instagr.am/reel/*",
			"https://instagr.am/reel/*"
		],
		"url": "https://api.instagram.com/oembed/",
		"formats": ["json"],
		builder: function (urlObj, obj) {
			obj.icon = "https://www.instagram.com/favicon.ico";
		}
	}]
};

module.exports = [googlemaps, youtube, twitter, instagram];

