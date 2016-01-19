var express = require('express');
var app = express();
var inspector = require('url-inspector');

app.get('/images', require('./sharpie')({
	rs: "w:320,h:240,min"
}));

app.get('/inspector', function(req, res, next) {
	inspector(req.query.url, function(err, data) {
		if (err) return next(err);
		if (data.thumbnail) {
			data.thumbnail = '/images?url=' + encodeURIComponent(data.thumbnail);
		} else if (data.type == "image") {
			data.thumbnail = '/images?url=' + encodeURIComponent(data.url);
		}
		res.send(data);
	});
});

app.get('*', express.static(__dirname + '/public'));

var server = app.listen(3001, function() {
	console.log(`Please open
http://localhost:${server.address().port}/index.html
`);
});
