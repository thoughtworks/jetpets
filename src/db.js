'use strict';

var knox = require('knox');
var s3client = knox.createClient({
  key: process.env.KEY,
  secret: process.env.SECRET,
  bucket: process.env.BUCKET
});

var DB_FILE = './players.json';

exports.loadPlayers = function(callback) {
  s3client.get(DB_FILE).on('response', function(res) {
    if (res.statusCode === 404) {
      callback(null, []);
    } else {
      var data = '';
      res.setEncoding('utf8');
      res.on('data', function(chunk) { data = data + chunk; });
      res.on('end', function() {
        callback(null, JSON.parse(data).players);
      });
    }
  }).end();
};

exports.savePlayers = function(players) {
  var content = JSON.stringify({players: players}, null, '\t') + '\n';
  var req = s3client.put(DB_FILE, {
    'Content-Length': content.length,
    'Content-Type': 'application/json'
  });
  req.on('response', function(res) {
    if (res.statusCode === 200) {
      console.log('Saved players to %s', res.url);
    } else {
      console.error('Something went wrong when saving players!');
    }
  });
  req.end(content);
};
