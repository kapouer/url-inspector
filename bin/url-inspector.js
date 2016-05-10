#!/usr/bin/node

var dash = require('dashdash');
var debug = require('debug')('url-inspector');

var parser = dash.createParser({options: [
	{
		names: ['help', 'h'],
		type: 'bool',
		help: 'Print this help and exit.'
	},
	{
		names: ['all'],
		type: 'bool',
		help: 'enable all metadata'
	}
]});

var opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

var url = opts._args.pop();

if (opts.help || !url) {
	var help = parser.help({includeEnv: true}).trimRight();
	console.log('usage: url-inspector [OPTIONS] <url>\n' + 'options:\n' + help);
	process.exit(0);
}

var inspector = require('..');

inspector(url, opts, function(err, meta) {
	if (err) {
		console.error(err);
		process.exit(1);
	} else {
		console.log(require('util').inspect(meta));
		process.exit(0);
	}
});

