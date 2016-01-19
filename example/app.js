var express = require('express');
var app = express();
var inspector = require('url-inspector');

app.get('/inspector', function(req, res, next) {
	inspector(req.query.url, function(err, data) {
		if (err) return next(err);
		res.send(data);
	});
});

app.get('*', express.static(__dirname + '/public'));

var server = app.listen(3001, function() {
	console.log(`Please open
http://localhost:${server.address().port}/index.html
`);
});
