#!/usr/bin/node

var dash = require('dashdash');

var parser = dash.createParser({options: [
	{
		names: ['help', 'h'],
		type: 'bool',
		help: 'Print this help and exit.'
	},
	{
		names: ['width'],
		type: 'integer',
		help: 'max thumbnail width'
	},
	{
		names: ['height'],
		type: 'integer',
		help: 'max thumbnail height'
	},
	{
		names: ['display'],
		type: 'string',
		help: 'X DISPLAY parameter'
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

var inspector = require('..')(opts);

inspector(url, function(err, meta) {
	if (err) {
		console.error(err);
		process.exit(1);
	} else {
		console.log(JSON.stringify(meta));
		process.exit(0);
	}
});

