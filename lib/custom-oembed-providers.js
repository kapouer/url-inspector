var googlemaps = {
	provider_name: "maps.google.com",
	endpoints: [{
		schemes: [/.*google\.[^\/]+\/maps\/place\/.+/],
		builder: function(urlObj, obj) {
			var match = /.*google\.[^\/]+\/maps\/place\/([\w\+]*)\/.*/.exec(urlObj.href);
			if (!match || match.length != 2) return;
			var place = encodeURIComponent(match[1]);
			obj.type = "embed";
			obj.html = `<iframe src="//maps.google.com/maps?t=m&q=${place}&output=embed"></iframe>`;
		}
	}]
};

module.exports = [googlemaps];

