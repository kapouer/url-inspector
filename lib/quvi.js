var execFile = require('child_process').execFile;
var URL = require('url');

var quvireg;

function init(cb) {
	if (quvireg) return cb();
	execFile('/usr/bin/quvi', ['--support'], function(err, stdout, stderr) {
		if (err) return cb(err);
		var str = stdout.toString();
		var arr = [];
		str.split('\n').forEach(function(line) {
			var luaReg = line.split('\t').shift().replace(/\%/g, '\\');
			if (luaReg) arr.push(luaReg);
		});
		quvireg = new RegExp(arr.join('|'), 'g');
		cb();
	});
}

exports.supports = function(hostname, cb) {
	init(function(err) {
		if (err) return cb(err);
		quvireg.lastIndex = 0;
		cb(null, quvireg.test(hostname));
	});
};

exports.query = function(url, cb) {
	execFile('/usr/bin/quvi', [url], function(err, stdout, stderr) {
		if (err) return cb(err);
		return cb(null, JSON.parse(stdout));
	});
};

