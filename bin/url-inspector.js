#!/usr/bin/node

var dash = require('dashdash');

var parser = dash.createParser({options: [
	{
		names: ['help', 'h'],
		type: 'bool',
		help: 'Print this help and exit.'
	}
]});

var opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

if (opts.help) {
	var help = parser.help({includeEnv: true}).trimRight();
	console.log('usage: url-inspector [OPTIONS] <url>\n' + 'options:\n' + help);
	process.exit(0);
}

var inspector = require('../')();
var url = opts._args.pop();
inspector(url, function(err, meta) {
	if (err) {
		console.error(err);
		process.exit(1);
	} else {
		console.log(JSON.stringify(meta));
		process.exit(0);
	}
});

