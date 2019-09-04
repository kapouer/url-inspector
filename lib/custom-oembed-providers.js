const googlemaps = {
	provider_name: "maps.google.com",
	endpoints: [{
		schemes: [/.*google\.[^/]+\/maps\/place\/.+/],
		builder: function(urlObj, obj) {
			var match = /.*google\.[^/]+\/maps\/place\/([\w+]*)\/.*/.exec(urlObj.href);
			if (!match || match.length != 2) return;
			var place = encodeURIComponent(match[1]);
			obj.type = "embed";
			obj.html = `<iframe src="//maps.google.com/maps?t=m&q=${place}&output=embed"></iframe>`;
		}
	}]
};

const youtube = {
	provider_name: "youtube.com",
	endpoints: [{
		schemes: [
			'https://*.youtube.com/v/*',
			'https://*.youtube.com/embed/*',
			'https://youtu.be/*'
		],
		url: 'https://www.youtube.com/oembed',
		redirect: function(obj) {
			if (obj.pathname == "/watch") return;
			var videoId;
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
	provider_name: "youtube.com",
	endpoints: [{
		schemes: [
			'https://twitter.com/*/status/*'
		],
		redirect: function(obj) {
			return true;
		}
	}]
};
module.exports = [googlemaps, youtube, twitter];

