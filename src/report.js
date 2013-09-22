var fs = require ('fs');

var players = require('../players.json');
var report = fs.createWriteStream('./report.csv', {flags: 'a'});
var keys = ['lastName', 'firstName', 'country', 'company', 'role', 'email'];

keys.forEach(function(k) {
  report.write(k);
  report.write(',');
});
report.write('\n');

players.players.forEach(function(player) {
  keys.forEach(function(k) {
    report.write(player[k]);
    report.write(',');
  });
  report.write('\n');
});
report.end();