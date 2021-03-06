#!/usr/bin/node

const dash = require('dashdash');
const debug = require('debug')('url-inspector');

const parser = dash.createParser({options: [
	{
		names: ['help', 'h'],
		type: 'bool',
		help: 'Print this help and exit.'
	},
	{
		names: ['all'],
		type: 'bool',
		help: 'enable all metadata'
	},
	{
		names: ['providers', 'p'],
		type: 'string',
		help: 'Path to js file exporting providers list'
	},
	{
		names: ['ua'],
		type: 'string',
		help: 'Custom User-Agent'
	}
]});

let opts;
try {
	opts = parser.parse(process.argv);
} catch(e) {
	console.error(e.toString());
	opts = {help: true};
}

let url = opts._args && opts._args.pop();

if (opts.help || !url) {
	const help = parser.help({includeEnv: true}).trimRight();
	console.log('usage: url-inspector [OPTIONS] <url>\n' + 'options:\n' + help);
	process.exit(0);
}

const inspector = require('..');

opts.file = true;
if (url.startsWith('./') || url.startsWith('/')) url = "file://" + url;

if (opts.providers) {
	opts.providers = require(opts.providers);
}

inspector(url, opts, function(err, meta) {
	if (err) {
		console.error(err);
		process.exit(1);
	} else {
		console.log(require('util').inspect(meta));
		process.exit(0);
	}
});

