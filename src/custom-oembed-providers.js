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
			obj.pathname = "/watch";
			obj.search = "?v=" + encodeURIComponent(videoId);
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


const instagram = {
	provider_name: "instagram.com",
	endpoints: [{
		last: true,
		schemes: [
			'https://www.instagram.com/p/*'
		],
		builder(urlObj, obj) {
			obj.site = 'Instagram';
			obj.title = 'Instagram ' + urlObj.pathname.split('/').pop();
			obj.icon = 'https://www.instagram.com/favicon.ico';
			obj.html = `<blockquote class="instagram-media" data-instgrm-captioned data-instgrm-permalink="${urlObj.href}" data-instgrm-version="14" style=" background:#FFF; border:0; border-radius:3px; box-shadow:0 0 1px 0 rgba(0,0,0,0.5),0 1px 10px 0 rgba(0,0,0,0.15); margin: 1px; max-width:540px; min-width:326px; padding:0; width:99.375%; width:-webkit-calc(100% - 2px); width:calc(100% - 2px);"></blockquote>`;
			obj.script = 'https://www.instagram.com/embed.js';
			obj.type = 'embed';
			obj.what = 'page';
		}
	}]
};

export default [googlemaps, youtube, twitter, instagram];

