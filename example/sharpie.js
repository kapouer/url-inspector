var sharp = require('sharp');
var express = require('express');
var stream = require('stream');
var util = require('util');
var request = require('request');

module.exports = function(defaults) {
	defaults = Object.assign({
		rs: "w:2048,h:2048,max"
	}, defaults);

	return function(req, res, next) {
		var url = req.query.url;
		var params = Object.assign({}, defaults, req.query);
		var pipeline = sharp();
		if (params.rs) {
			resize(pipeline, parseParams(params.rs));
		}
		request(url).pipe(pipeline).pipe(res);
	};
};

function parseParams(str) {
	var obj = {};
	str.split(',').forEach(function(str) {
		var couple = str.trim().split(':');
		obj[couple[0]] = couple.length == 2 ? couple[1] : true;
	});
	return obj;
}

function resize(pipeline, params) {
	pipeline.withoutEnlargement();
	pipeline.resize(parseInt(params.w), parseInt(params.h));
	if (params.max) pipeline.max();
	if (params.min) pipeline.min();
}

